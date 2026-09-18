const express = require("express");
const { getWalletByUserId, adjustBalance } = require("../repositories/accountRepo");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

async function sendWalletLookup(userId, res) {
  try {
    const wallet = await getWalletByUserId(userId);

    if (!wallet) {
      return res.status(404).json({ error: "user not found" });
    }

    res.json({
      userId,
      walletId: wallet.id,
      balance: wallet.balance,
      currency: wallet.currency,
    });
  } catch (err) {
    res.status(500).json({ error: "internal server error" });
  }
}

router.get("/wallets/:userId", requireAuth, async (req, res) => {
  await sendWalletLookup(req.params.userId, res);
});

// Unauthenticated, for service-to-service lookups (e.g. transaction-service
// resolving a userId to its walletId before calling /internal/wallets/:walletId/adjust).
// GET /wallets/:userId above stays behind requireAuth for direct end-user access.
router.get("/internal/wallets/:userId", async (req, res) => {
  await sendWalletLookup(req.params.userId, res);
});

router.post("/internal/wallets/:walletId/adjust", async (req, res) => {
  const idempotencyKey = req.get("Idempotency-Key");
  const { amount, type } = req.body || {};

  if (!idempotencyKey) {
    return res.status(400).json({ error: "Idempotency-Key header is required" });
  }

  const isValidAmount = typeof amount === "number" && Number.isFinite(amount) && amount > 0;
  const isValidType = type === "debit" || type === "credit";

  if (!isValidAmount || !isValidType) {
    return res.status(400).json({
      error: "amount (positive number) and type ('debit' or 'credit') are required",
    });
  }

  try {
    const result = await adjustBalance(req.params.walletId, amount, type, idempotencyKey);
    res.status(result.status).json(result.body);
  } catch (err) {
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;
