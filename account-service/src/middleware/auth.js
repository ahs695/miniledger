const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const authHeader = req.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing token" });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: "invalid or expired token" });
  }
}

module.exports = { requireAuth };
