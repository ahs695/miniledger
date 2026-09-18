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
});
