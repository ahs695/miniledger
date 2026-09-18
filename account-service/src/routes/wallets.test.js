const request = require("supertest");
const app = require("../app");
const { pool } = require("../db");

let userId;
let token;

beforeAll(async () => {
  const createRes = await request(app)
    .post("/users")
    .send({ email: "wallets-test-user@example.com" });
  userId = createRes.body.userId;

  const tokenRes = await request(app).post("/auth/token").send({ userId });
  token = tokenRes.body.token;
});

afterAll(async () => {
  await pool.end();
});

describe("GET /wallets/:userId", () => {
  test("returns the wallet with a valid token", async () => {
    const res = await request(app)
      .get(`/wallets/${userId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId,
      walletId: expect.any(String),
      balance: "0.00",
      currency: "INR",
    });
  });

  test("returns 404 for an unknown user", async () => {
    const res = await request(app)
      .get("/wallets/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "user not found" });
  });

  test("returns 401 with no token", async () => {
    const res = await request(app).get(`/wallets/${userId}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "missing token" });
  });
});
