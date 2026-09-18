const Transaction = require("../models/Transaction");

async function createPending({ fromWalletId, toWalletId, amount, idempotencyKey }) {
  return Transaction.create({ fromWalletId, toWalletId, amount, idempotencyKey });
}

async function markCompleted(id) {
  return Transaction.findByIdAndUpdate(
    id,
    { status: "completed", completedAt: new Date() },
    { new: true }
  );
}

async function markFailed(id, reason) {
  return Transaction.findByIdAndUpdate(
    id,
    { status: "failed", "metadata.reason": reason },
    { new: true }
  );
}

async function findByUser(walletId, { limit = 20, offset = 0 } = {}) {
  return Transaction.find({
    $or: [{ fromWalletId: walletId }, { toWalletId: walletId }],
  })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);
}

module.exports = { createPending, markCompleted, markFailed, findByUser };
