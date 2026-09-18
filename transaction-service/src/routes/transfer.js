const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getWallet, adjustWallet } = require("../clients/accountClient");
const { createPending, markCompleted, markFailed } = require("../repositories/transactionRepo");

const router = express.Router();

function errorMessage(err) {
  return (err.response && err.response.data && err.response.data.error) || err.message;
}

router.post("/transfer", async (req, res) => {
  const { fromUserId, toUserId, amount } = req.body || {};

  // amount must satisfy the Transaction schema's own min: 0.01 — validating
  // only `> 0` here would let e.g. 0.005 through and then throw an unhandled
  // Mongoose ValidationError inside createPending below.
  const isValidAmount = typeof amount === "number" && Number.isFinite(amount) && amount >= 0.01;
  const isValidUserIds =
    typeof fromUserId === "string" &&
    fromUserId.trim().length > 0 &&
    typeof toUserId === "string" &&
    toUserId.trim().length > 0 &&
    fromUserId !== toUserId;

  if (!isValidAmount || !isValidUserIds) {
    return res.status(400).json({
      error: "fromUserId, toUserId (distinct, non-empty) and amount >= 0.01 are required",
    });
  }

  let transaction;

  try {
    const fromWallet = await getWallet(fromUserId);
    if (!fromWallet) {
      return res.status(404).json({ error: "user not found" });
    }

    const toWallet = await getWallet(toUserId);
    if (!toWallet) {
      return res.status(404).json({ error: "user not found" });
    }

    const idempotencyKey = uuidv4();

    transaction = await createPending({
      fromWalletId: fromWallet.walletId,
      toWalletId: toWallet.walletId,
      amount,
      idempotencyKey,
    });

    try {
      // Each leg gets its own sub-key derived from the one idempotencyKey
      // generated for this transfer. account-service's idempotency_keys
      // table is keyed globally (not per-wallet), so reusing the exact same
      // key for both calls would make the credit call find the debit's
      // already-cached response and replay it instead of actually crediting
      // the destination wallet — a silent fund-loss bug.
      await adjustWallet(fromWallet.walletId, amount, "debit", `${idempotencyKey}:debit`);
      await adjustWallet(toWallet.walletId, amount, "credit", `${idempotencyKey}:credit`);
    } catch (err) {
      const failed = await markFailed(transaction._id, errorMessage(err));
      return res.status(502).json(failed);
    }

    const completed = await markCompleted(transaction._id);
    res.status(201).json(completed);
  } catch (err) {
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;
