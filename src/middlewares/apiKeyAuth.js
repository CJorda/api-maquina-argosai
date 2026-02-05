const apiKey = process.env.API_KEY;

function apiKeyAuth(req, res, next) {
  try {
    const key = req.header('x-api-key');
    if (key && key === apiKey) {
      return next();
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
