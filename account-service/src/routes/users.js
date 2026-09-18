const express = require("express");
const { createUser } = require("../repositories/accountRepo");

const router = express.Router();

function isValidEmail(email) {
  return typeof email === "string" && email.trim().length > 0 && email.includes("@");
}

router.post("/users", async (req, res) => {
  const { email } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "invalid email" });
  }

  try {
    const { userId, walletId, balance, currency } = await createUser(email);
    res.status(201).json({ userId, walletId, balance, currency });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "email already in use" });
    }
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;
