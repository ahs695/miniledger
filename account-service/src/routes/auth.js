const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

// Dev-only shortcut for minting a token to test protected routes locally,
// without building a full login flow. Never available in production.
if (process.env.NODE_ENV !== "production") {
  router.post("/auth/token", (req, res) => {
    const { userId } = req.body || {};

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token });
  });
}

module.exports = router;
