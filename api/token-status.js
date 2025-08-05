const { getTokenStatus } = require("../utils/tokenTracker");

module.exports = async (req, res) => {
  // Csak GET kérés engedélyezett
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Privát védelmi kulcs ellenőrzés (pl. csak te nézhesd meg)
  const authHeader = req.headers.authorization;
  const secretKey = process.env.TOKEN_STATUS_SECRET; // ezt állítsd be a .env fájlodban

  if (!authHeader || authHeader !== `Bearer ${secretKey}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const status = getTokenStatus();
  return res.status(200).json(status);
};
