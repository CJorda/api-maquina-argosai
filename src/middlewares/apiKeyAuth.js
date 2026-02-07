import crypto from 'crypto';

function apiKeyAuth(req, res, next) {
  try {
    const apiKey = process.env.API_KEY;
    const key = req.header('x-api-key');
    if (typeof key === 'string' && typeof apiKey === 'string') {
      const keyBuf = Buffer.from(key);
      const apiKeyBuf = Buffer.from(apiKey);
      if (keyBuf.length === apiKeyBuf.length && crypto.timingSafeEqual(keyBuf, apiKeyBuf)) {
        return next();
      }
    }
    res.status(401).json({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      detail: "API key is missing or invalid"
    });
  } catch (err) {
    res.status(400).json({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "Error processing authentication"
    });
  }
}

export default apiKeyAuth;
