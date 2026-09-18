const express = require("express");
const { createUser, deleteUser } = require("../repositories/accountRepo");

const router = express.Router();

function isValidEmail(email) {
  return typeof email === "string" && email.trim().length > 0 && email.includes("@");
}

router.post("/users", async (req, res) => {
  const { email, initialBalance } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "invalid email" });
  }

  const hasInitialBalance = initialBalance !== undefined;
  const isValidInitialBalance =
    !hasInitialBalance ||
    (typeof initialBalance === "number" && Number.isFinite(initialBalance) && initialBalance >= 0);

  if (!isValidInitialBalance) {
    return res.status(400).json({ error: "initialBalance must be a non-negative number" });
  }

  try {
    const { userId, walletId, balance, currency } = await createUser(
      email,
      hasInitialBalance ? initialBalance : 0
    );
    res.status(201).json({ userId, walletId, balance, currency });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "email already in use" });
    }
    res.status(500).json({ error: "internal server error" });
  }
});

router.delete("/users/:userId", async (req, res) => {
  try {
    const result = await deleteUser(req.params.userId);
    res.status(result.status).json(result.body);
  } catch (err) {
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;
