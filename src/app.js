import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import fs from 'fs';
import morgan from 'morgan';
import http2 from 'http2';
import dataRoutes from './routes/dataRoutes.js';

const app = express();
app.use(helmet());

/*
 Standard headers used by this API:
 - `Content-Type`: response content media type (JSON responses use application/json)
 - `Accept`: client indicates acceptable response types
 - `Cache-Control`: controls caching behavior for GET responses
 - `ETag`: entity tag for response representation (Express provides ETag support)
 - `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`: rate limit metadata
 Compression: gzip via `compression` middleware to reduce bandwidth.
 ETag: enabled via `app.set('etag', 'strong')`.
*/

// Enable gzip/deflate compression
app.use(compression());

// Use strong ETag generation for cache validation
app.set('etag', 'strong');

// JSON parsing middleware and parse error handler
const accessLogStream = fs.createWriteStream('./access.log', { flags: 'a' });
app.use(morgan(function (tokens, req, res) {
  return [
    tokens.date(req, res, 'iso'),
    tokens['remote-addr'](req, res),
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.res(req, res, 'content-length'),
    'API-Key:', req.headers['x-api-key'] || '-',
    'User-Agent:', tokens['user-agent'](req, res),
    'Response-Time:', tokens['response-time'](req, res),
    'Body:', JSON.stringify(req.body)
  ].join(' | ');
}, {
  stream: accessLogStream
}));
app.use(express.json());

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
  standardHeaders: true, // returns the rate limit info in the `RateLimit-*` headers
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
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    next();
  } else {
    res.redirect(301, 'https://' + req.headers.host + req.url);
  }
});

app.use('/v1', dataRoutes);

app.use((req, res) => {
  res.status(404).json({
    type: "about:blank",
    title: "Not Found",
    status: 404,
    detail: "Resource not found"
  });
});

// Liveness and readiness endpoints
let isShuttingDown = false;
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/ready', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ type: 'about:blank', title: 'Service Unavailable', status: 503, detail: 'Shutting down' });
  }
  return res.status(200).json({ status: 'ready' });
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

// HTTP/2 configuration (requires certs in ./certs)
const http2Options = {
  key: fs.readFileSync('./certs/key.pem'),
  cert: fs.readFileSync('./certs/cert.pem'),
  allowHTTP1: true // allow HTTP/1.1 clients as well
};

const server = http2.createSecureServer(http2Options, app);
server.listen(PORT, () => {
  console.log(`API listening on HTTP/2 and HTTP/1.1 port ${PORT}`);
});

// Graceful shutdown
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully...`);
  // Stop accepting new connections
  server.close(err => {
    try { accessLogStream.end(); } catch (e) {}
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
    try { accessLogStream.end(); } catch (e) {}
    process.exit(1);
  }, 30000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// mkcert -install
// mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost
