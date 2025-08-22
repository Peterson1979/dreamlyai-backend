// utils/middleware.js
module.exports = function authMiddleware(req, res, next) {
  const secret = process.env.TOKEN_STATUS_SECRET;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || authHeader !== secret) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing authorization token.' });
  }

  next();
};
