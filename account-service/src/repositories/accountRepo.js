const { pool, query } = require("../db");

async function createUser(email) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [email.trim()]
    );
    const userId = userResult.rows[0].id;

    const walletResult = await client.query(
      "INSERT INTO wallets (user_id) VALUES ($1) RETURNING id, balance, currency",
      [userId]
    );
    const wallet = walletResult.rows[0];

    await client.query("COMMIT");

    return {
      userId,
      walletId: wallet.id,
      balance: wallet.balance,
      currency: wallet.currency,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getWalletByUserId(userId) {
  const result = await query(
    "SELECT id, balance, currency FROM wallets WHERE user_id = $1",
    [userId]
  );
  return result.rows[0] || null;
}

async function adjustBalance(walletId, amount, type, idempotencyKey) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT response FROM idempotency_keys WHERE key = $1",
      [idempotencyKey]
    );

    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      return existing.rows[0].response;
    }

    const deltaStr = (type === "credit" ? amount : -amount).toFixed(2);

    // Lock the wallet row before reading its balance. Without FOR UPDATE, two
    // concurrent adjust requests for the same wallet could both read the same
    // starting balance, both independently decide they have sufficient funds,
    // and both commit their updates — a lost-update race that can push the
    // balance negative despite the check below (or silently drop one of the
    // two adjustments). FOR UPDATE takes a row-level lock, so a second
    // concurrent request on the same wallet blocks until this transaction
    // commits or rolls back, forcing adjustments to be applied one at a time
    // against the true current balance.
    const lockResult = await client.query(
      `SELECT
         balance + $1::numeric AS new_balance,
         (balance + $1::numeric) < 0 AS insufficient
       FROM wallets
       WHERE id = $2
       FOR UPDATE`,
      [deltaStr, walletId]
    );

    if (lockResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { status: 404, body: { error: "wallet not found" } };
    }

    const { new_balance: newBalance, insufficient } = lockResult.rows[0];

    if (insufficient) {
      await client.query("ROLLBACK");
      return { status: 422, body: { error: "insufficient funds" } };
    }

    const updateResult = await client.query(
      "UPDATE wallets SET balance = $1 WHERE id = $2 RETURNING balance, currency",
      [newBalance, walletId]
    );

    const response = {
      status: 200,
      body: {
        walletId,
        balance: updateResult.rows[0].balance,
        currency: updateResult.rows[0].currency,
      },
    };

    await client.query(
      "INSERT INTO idempotency_keys (key, response) VALUES ($1, $2::jsonb)",
      [idempotencyKey, JSON.stringify(response)]
    );

    await client.query("COMMIT");

    return response;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createUser, getWalletByUserId, adjustBalance };
