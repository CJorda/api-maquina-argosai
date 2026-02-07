import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import fs from 'fs';
import morgan from 'morgan';
import https from 'https';
import dataRoutes from './routes/dataRoutes.js';
import inferenceRoutes from './routes/inferenceRoutes.js';
import countRoutes from './routes/countRoutes.js';

const app = express();
// Do not advertise framework
app.disable('x-powered-by');
// Trust the first proxy when explicitly enabled (needed for x-forwarded-proto)
const trustProxyEnabled = process.env.TRUST_PROXY === '1';
if (trustProxyEnabled) {
  app.set('trust proxy', 1);
}

// Early header filtering: enforce a strict allowlist so responses return
// only essential headers. This reduces response size and avoids leaking
// implementation details to callers.
{
  // Minimal allowlist: only the absolute essentials for API responses.
  const allowed = new Set([
    'content-type',
    'cache-control',
    'strict-transport-security',
    'content-security-policy',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'cross-origin-resource-policy',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'origin-agent-cluster',
    'x-dns-prefetch-control',
    'x-download-options',
    'x-permitted-cross-domain-policies',
    'date',
    'connection',
    'transfer-encoding'
  ]);
  app.use((req, res, next) => {
    const originalSetHeader = res.setHeader.bind(res);
    res.setHeader = function (name, value) {
      try {
        const n = String(name).toLowerCase();
        if (!allowed.has(n)) return;
      } catch (e) {}
      return originalSetHeader(name, value);
    };

    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = function (statusCode, statusMessage, headers) {
      if (typeof statusMessage === 'object' && headers === undefined) {
        headers = statusMessage;
        statusMessage = undefined;
      }
      if (headers && typeof headers === 'object') {
        for (const h of Object.keys({ ...headers })) {
          if (!allowed.has(h.toLowerCase())) delete headers[h];
        }
      }
      try {
        const existing = res.getHeaders ? res.getHeaders() : {};
        for (const h of Object.keys(existing)) {
          if (!allowed.has(h.toLowerCase())) {
            try { res.removeHeader(h); } catch (e) {}
          }
        }
      } catch (e) {}
      return originalWriteHead(statusCode, statusMessage, headers);
    };
    next();
  });
}

// Helmet: apply recommended protections from the guide.
// Use the default `helmet()` then enable/select specific policies.
app.use(helmet());

// Content Security Policy: conservative defaults for an API that mostly
// returns JSON. Keep directives minimal to avoid over-restricting clients.
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    upgradeInsecureRequests: [],
  }
}));

// Frameguard: prevent clickjacking
app.use(helmet.frameguard({ action: 'deny' }));

// HSTS: ensure browsers use HTTPS
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));

// Prevent MIME type sniffing
app.use(helmet.noSniff());

// Referrer-Policy
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));

// Keep Cross-Origin-Resource-Policy relaxed for same-origin by default
app.use(helmet.crossOriginResourcePolicy({ policy: 'same-origin' }));

/*
 Response headers in use by this API:
 - `Content-Type`: response content media type (JSON responses use application/json)
 - `Cache-Control`: controls caching behavior for GET responses
 - `Strict-Transport-Security`: HSTS when HTTPS is used
 - `Date`, `Connection`, `Transfer-Encoding`: managed by Node/Express
 Compression: gzip via `compression` middleware to reduce bandwidth.
 ETag: disabled via `app.set('etag', false)`.
 Rate limit headers: suppressed (and not exposed by the header allowlist).
*/

// Enable gzip/deflate compression
app.use(compression());

// Disable ETag to avoid exposing internal representation details
app.set('etag', false);

// JSON parsing middleware and parse error handler
const logFilePath = (process.env.LOG_FILE || '').trim();
const accessLogStream = logFilePath
  ? fs.createWriteStream(logFilePath, { flags: 'a' })
  : process.stdout;
app.use(morgan(function (tokens, req, res) {
  // Mask API key and avoid logging full request body
  const apiKeyMasked = req.headers['x-api-key'] ? 'REDACTED' : '-';
  return [
    tokens.date(req, res, 'iso'),
    tokens['remote-addr'](req, res),
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.res(req, res, 'content-length'),
    'API-Key:', apiKeyMasked,
    'User-Agent:', tokens['user-agent'](req, res),
    'Response-Time:', tokens['response-time'](req, res)
  ].join(' | ');
}, {
  stream: accessLogStream
}));
app.use(express.json({ limit: '100kb' }));

// Default Cache-Control for GET responses: no-store for API responses by default
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "Request body contains invalid JSON"
    });
  }
  next(err);
});

// Rate limiting: 100 requests per 15 minutes per IP
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 100;
const limiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: RATE_MAX,
  // Do not emit RateLimit-* headers to clients to avoid exposing limits
  standardHeaders: false,
  legacyHeaders: false,
  handler: (req, res /*, next */) => {
    // Provide Retry-After and rate limit headers for clients
    res.setHeader('Retry-After', Math.ceil(RATE_WINDOW_MS / 1000));
    res.setHeader('X-RateLimit-Limit', RATE_MAX);
    res.setHeader('X-RateLimit-Remaining', 0);
    return res.status(429).json({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Too many requests, please try again later.'
    });
  }
});
app.use(limiter);

// Redirect HTTP to HTTPS when not already secure (useful behind proxies)
app.use((req, res, next) => {
  // During tests we don't want to redirect to HTTPS (Supertest uses app directly).
  if (process.env.NODE_ENV === 'test') return next();
  if (req.secure || (trustProxyEnabled && req.headers['x-forwarded-proto'] === 'https')) {
    return next();
  }
  return res.redirect(301, 'https://' + req.headers.host + req.url);
});

app.use('/v1', dataRoutes);
app.use('/v1', inferenceRoutes);
app.use('/v1', countRoutes);

// Liveness and readiness endpoints (should be before the 404 handler)
let isShuttingDown = false;
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/ready', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ type: 'about:blank', title: 'Service Unavailable', status: 503, detail: 'Shutting down' });
  }
  return res.status(200).json({ status: 'ready' });
});

app.use((req, res) => {
  res.status(404).json({
    type: "about:blank",
    title: "Not Found",
    status: 404,
    detail: "Resource not found"
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    type: "about:blank",
    title: "Internal Server Error",
    status: 500,
    detail: "An unexpected error occurred."
  });
});

const PORT = process.env.PORT || 3000;

// Start server: prefer HTTPS/HTTP2 if certs exist, otherwise fall back to plain HTTP
// HTTPS configuration (requires certs in ./certs)
if (process.env.NODE_ENV !== 'test') {
  // HTTPS configuration (requires certs in ./certs)
  const keyPath = './certs/key.pem';
  const certPath = './certs/cert.pem';
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error('Missing TLS certs. Expected ./certs/key.pem and ./certs/cert.pem');
    console.error('Generate certs (dev): mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost');
    process.exit(1);
  }
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };

  const server = https.createServer(httpsOptions, app);
  server.listen(PORT, () => {
    console.log(`API listening on HTTPS (HTTP/1.1) port ${PORT}`);
  });

  // Graceful shutdown
  function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Received ${signal}; shutting down gracefully...`);
    // Stop accepting new connections
    server.close(err => {
      if (accessLogStream !== process.stdout) {
        try { accessLogStream.end(); } catch (e) {}
      }
      if (err) {
        console.error('Error while closing server:', err);
        process.exit(1);
      }
      console.log('Closed remaining connections; exiting.');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      console.error('Forcing shutdown after timeout.');
      if (accessLogStream !== process.stdout) {
        try { accessLogStream.end(); } catch (e) {}
      }
      process.exit(1);
    }, 30000).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// mkcert -install
// mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost

// Export the Express app for testing/imports without starting the server
export default app;
