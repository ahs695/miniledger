const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
};

jest.mock("pg", () => ({
  Pool: jest.fn(() => mockPool),
}));

const { adjustBalance } = require("./accountRepo");

const walletId = "wallet-1";

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.connect.mockResolvedValue(mockClient);
});

describe("adjustBalance", () => {
  test("fresh Idempotency-Key on a valid credit updates the balance and inserts an idempotency_keys row", async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // idempotency SELECT — not found
      .mockResolvedValueOnce({ rows: [{ new_balance: "150.00", insufficient: false }] }) // lock SELECT
      .mockResolvedValueOnce({ rows: [{ balance: "150.00", currency: "INR" }] }) // UPDATE
      .mockResolvedValueOnce(undefined) // INSERT idempotency_keys
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await adjustBalance(walletId, 50, "credit", "key-credit-1");

    expect(result).toEqual({
      status: 200,
      body: { walletId, balance: "150.00", currency: "INR" },
    });

    const calls = mockClient.query.mock.calls;
    expect(calls).toHaveLength(6);
    expect(calls[0][0]).toBe("BEGIN");
    expect(calls[1]).toEqual([
      "SELECT response FROM idempotency_keys WHERE key = $1",
      ["key-credit-1"],
    ]);
    expect(calls[2][0]).toMatch(/FOR UPDATE/);
    expect(calls[2][1]).toEqual(["50.00", walletId]); // positive delta for a credit
    expect(calls[3]).toEqual([
      "UPDATE wallets SET balance = $1 WHERE id = $2 RETURNING balance, currency",
      ["150.00", walletId],
    ]);
    expect(calls[4][0]).toBe(
      "INSERT INTO idempotency_keys (key, response) VALUES ($1, $2::jsonb)"
    );
    expect(calls[4][1][0]).toBe("key-credit-1");
    expect(calls[5][0]).toBe("COMMIT");

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test("calling with a previously-used key returns the cached response and does not touch the balance query again", async () => {
    const cachedResponse = {
      status: 200,
      body: { walletId, balance: "999.00", currency: "INR" },
    };

    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ response: cachedResponse }] }) // idempotency SELECT — found
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await adjustBalance(walletId, 50, "credit", "reused-key");

    expect(result).toEqual(cachedResponse);

    const calls = mockClient.query.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toBe("BEGIN");
    expect(calls[1]).toEqual([
      "SELECT response FROM idempotency_keys WHERE key = $1",
      ["reused-key"],
    ]);
    expect(calls[2][0]).toBe("COMMIT");

    const allSql = calls.map((call) => call[0]);
    expect(allSql.some((sql) => sql.includes("FOR UPDATE"))).toBe(false);
    expect(allSql.some((sql) => sql.includes("UPDATE wallets"))).toBe(false);
    expect(allSql.some((sql) => sql.includes("INSERT INTO idempotency_keys"))).toBe(false);

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test("a debit larger than the current balance returns the 422 error shape without writing a new balance or idempotency key", async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // idempotency SELECT — not found
      .mockResolvedValueOnce({ rows: [{ new_balance: "-50.00", insufficient: true }] }) // lock SELECT
      .mockResolvedValueOnce(undefined); // ROLLBACK

    const result = await adjustBalance(walletId, 80, "debit", "key-debit-fail");

    expect(result).toEqual({
      status: 422,
      body: { error: "insufficient funds" },
    });

    const calls = mockClient.query.mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[0][0]).toBe("BEGIN");
    expect(calls[1][0]).toBe("SELECT response FROM idempotency_keys WHERE key = $1");
    expect(calls[2][0]).toMatch(/FOR UPDATE/);
    expect(calls[2][1]).toEqual(["-80.00", walletId]); // negative delta for a debit
    expect(calls[3][0]).toBe("ROLLBACK");

    const allSql = calls.map((call) => call[0]);
    expect(allSql.some((sql) => sql.includes("UPDATE wallets"))).toBe(false);
    expect(allSql.some((sql) => sql.includes("INSERT INTO idempotency_keys"))).toBe(false);

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test("a valid debit within balance succeeds", async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // idempotency SELECT — not found
      .mockResolvedValueOnce({ rows: [{ new_balance: "60.00", insufficient: false }] }) // lock SELECT
      .mockResolvedValueOnce({ rows: [{ balance: "60.00", currency: "INR" }] }) // UPDATE
      .mockResolvedValueOnce(undefined) // INSERT idempotency_keys
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await adjustBalance(walletId, 40, "debit", "key-debit-ok");

    expect(result).toEqual({
      status: 200,
      body: { walletId, balance: "60.00", currency: "INR" },
    });

    const calls = mockClient.query.mock.calls;
    expect(calls).toHaveLength(6);
    expect(calls[2][0]).toMatch(/FOR UPDATE/);
    expect(calls[2][1]).toEqual(["-40.00", walletId]); // negative delta for a debit
    expect(calls[3]).toEqual([
      "UPDATE wallets SET balance = $1 WHERE id = $2 RETURNING balance, currency",
      ["60.00", walletId],
    ]);
    expect(calls[4][0]).toBe(
      "INSERT INTO idempotency_keys (key, response) VALUES ($1, $2::jsonb)"
    );
    expect(calls[5][0]).toBe("COMMIT");

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
