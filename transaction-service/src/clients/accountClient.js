const axios = require("axios");
const axiosRetry = require("axios-retry").default;

const ACCOUNT_SERVICE_URL = process.env.ACCOUNT_SERVICE_URL;

const client = axios.create();

// A retried adjustWallet POST is safe even though it's not naturally
// idempotent at the HTTP-method level: it always carries the same
// caller-supplied Idempotency-Key, so a retry either re-runs the exact same
// operation or hits account-service's idempotency cache and gets the
// original result back — never double-applies.
axiosRetry(client, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // 422 is a real business failure (insufficient funds), not a transient
    // one — never retry it, let it propagate immediately.
    if (error.response && error.response.status === 422) {
      return false;
    }
    return axiosRetry.isNetworkError(error) || (Boolean(error.response) && error.response.status >= 500);
  },
});

async function getWallet(userId) {
  try {
    const { data } = await client.get(`${ACCOUNT_SERVICE_URL}/internal/wallets/${userId}`);
    return data;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return null;
    }
    throw err;
  }
}

async function adjustWallet(walletId, amount, type, idempotencyKey) {
  const { data } = await client.post(
    `${ACCOUNT_SERVICE_URL}/internal/wallets/${walletId}/adjust`,
    { amount, type },
    { headers: { "Idempotency-Key": idempotencyKey } }
  );
  return data;
}

module.exports = { getWallet, adjustWallet };
