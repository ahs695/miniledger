const express = require("express");
const { getWallet } = require("../clients/accountClient");
const { findByUser } = require("../repositories/transactionRepo");

const router = express.Router();

function parseNonNegativeInt(value, fallback) {
  if (value === undefined) {
    return { value: fallback, valid: true };
  }
  if (!/^\d+$/.test(value)) {
    return { value: null, valid: false };
  }
  return { value: parseInt(value, 10), valid: true };
}

router.get("/transactions/:userId", async (req, res) => {
  const limit = parseNonNegativeInt(req.query.limit, 20);
  const offset = parseNonNegativeInt(req.query.offset, 0);

  if (!limit.valid || !offset.valid) {
    return res.status(400).json({
      error: "limit and offset must be non-negative integers",
    });
  }

  try {
    const wallet = await getWallet(req.params.userId);

    if (!wallet) {
      return res.status(404).json({ error: "user not found" });
    }

    const transactions = await findByUser(wallet.walletId, {
      limit: limit.value,
      offset: offset.value,
    });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;
