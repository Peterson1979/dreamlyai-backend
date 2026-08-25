// api/token-status.js
const { getBudgetStatus } = require("../utils/budget");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // Strict Fail-Closed Authorization Check
  const secretKey = process.env.TOKEN_STATUS_SECRET;

  // Fail closed if the secret is not configured or is empty
  if (!secretKey || typeof secretKey !== "string" || secretKey.trim().length === 0) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Token status monitoring secret is not configured.",
    });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || authHeader !== `Bearer ${secretKey.trim()}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const status = await getBudgetStatus();
  return res.status(200).json(status);
};
