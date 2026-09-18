const request = require("supertest");
const app = require("../app");
const { pool } = require("../db");

afterAll(async () => {
  await pool.end();
});

describe("POST /users", () => {
  test("creates a user with a fresh email", async () => {
    const res = await request(app)
      .post("/users")
      .send({ email: "users-test-alice@example.com" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      userId: expect.any(String),
      walletId: expect.any(String),
      balance: "0.00",
      currency: "INR",
    });
  });

  test("returns 409 for a duplicate email", async () => {
    const email = "users-test-bob@example.com";

    const first = await request(app).post("/users").send({ email });
    expect(first.status).toBe(201);

    const second = await request(app).post("/users").send({ email });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: "email already in use" });
  });

  test("creates a user with a provided initial balance", async () => {
    const res = await request(app)
      .post("/users")
      .send({ email: "users-test-funded@example.com", initialBalance: 50 });

    expect(res.status).toBe(201);
    expect(res.body.balance).toBe("50.00");
  });

  test("rejects a negative initialBalance", async () => {
    const res = await request(app)
      .post("/users")
      .send({ email: "users-test-negative@example.com", initialBalance: -10 });

    expect(res.status).toBe(400);
  });
});

describe("GET /users", () => {
  test("lists created users, newest first", async () => {
    const first = await request(app)
      .post("/users")
      .send({ email: "users-test-list-1@example.com" });
    const second = await request(app)
      .post("/users")
      .send({ email: "users-test-list-2@example.com", initialBalance: 10 });

    const res = await request(app).get("/users");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const ids = res.body.map((u) => u.userId);
    expect(ids.indexOf(second.body.userId)).toBeLessThan(ids.indexOf(first.body.userId));

    const listed = res.body.find((u) => u.userId === second.body.userId);
    expect(listed).toEqual({
      userId: second.body.userId,
      email: "users-test-list-2@example.com",
      walletId: second.body.walletId,
      balance: "10.00",
      currency: "INR",
    });
  });

  test("rejects an invalid limit", async () => {
    const res = await request(app).get("/users?limit=abc");
    expect(res.status).toBe(400);
  });
});

describe("DELETE /users/:userId", () => {
  test("deletes a user with a zero balance", async () => {
    const createRes = await request(app)
      .post("/users")
      .send({ email: "users-test-delete-me@example.com" });

    const deleteRes = await request(app).delete(`/users/${createRes.body.userId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ userId: createRes.body.userId, deleted: true });

    const lookupRes = await request(app).get(`/internal/wallets/${createRes.body.userId}`);
    expect(lookupRes.status).toBe(404);
  });

  test("refuses to delete a user with a non-zero balance", async () => {
    const createRes = await request(app)
      .post("/users")
      .send({ email: "users-test-delete-funded@example.com", initialBalance: 25 });

    const deleteRes = await request(app).delete(`/users/${createRes.body.userId}`);
    expect(deleteRes.status).toBe(409);

    const lookupRes = await request(app).get(`/internal/wallets/${createRes.body.userId}`);
    expect(lookupRes.status).toBe(200);
  });

  test("returns 404 for an unknown userId", async () => {
    const res = await request(app).delete("/users/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
