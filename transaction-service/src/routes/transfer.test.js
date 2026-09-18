require("dotenv").config();

jest.mock("../clients/accountClient");

const request = require("supertest");
const mongoose = require("mongoose");
const accountClient = require("../clients/accountClient");
const { connectDB } = require("../db");
const app = require("../app");
const Transaction = require("../models/Transaction");

const createdIds = [];

beforeAll(async () => {
  await connectDB();
});

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  await Transaction.deleteMany({ _id: { $in: createdIds } });
  await mongoose.disconnect();
});

describe("POST /transfer", () => {
  test("creates a completed Transaction when adjustWallet resolves", async () => {
    accountClient.getWallet
      .mockResolvedValueOnce({
        userId: "transfer-test-from-user",
        walletId: "transfer-test-from-wallet",
        balance: "100.00",
        currency: "INR",
      })
      .mockResolvedValueOnce({
        userId: "transfer-test-to-user",
        walletId: "transfer-test-to-wallet",
        balance: "0.00",
        currency: "INR",
      });
    accountClient.adjustWallet.mockResolvedValue({
      walletId: "transfer-test-from-wallet",
      balance: "50.00",
      currency: "INR",
    });

    const res = await request(app).post("/transfer").send({
      fromUserId: "transfer-test-from-user",
      toUserId: "transfer-test-to-user",
      amount: 50,
    });

    createdIds.push(res.body._id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      fromWalletId: "transfer-test-from-wallet",
      toWalletId: "transfer-test-to-wallet",
      amount: 50,
      status: "completed",
    });
    expect(accountClient.adjustWallet).toHaveBeenCalledTimes(2);

    const saved = await Transaction.findById(res.body._id);
    expect(saved.status).toBe("completed");
  });

  test("creates a failed Transaction when adjustWallet rejects", async () => {
    accountClient.getWallet
      .mockResolvedValueOnce({
        userId: "transfer-test-from-user",
        walletId: "transfer-test-from-wallet",
        balance: "10.00",
        currency: "INR",
      })
      .mockResolvedValueOnce({
        userId: "transfer-test-to-user",
        walletId: "transfer-test-to-wallet",
        balance: "0.00",
        currency: "INR",
      });

    const insufficientFundsError = new Error("Request failed with status code 422");
    insufficientFundsError.response = {
      status: 422,
      data: { error: "insufficient funds" },
    };
    accountClient.adjustWallet.mockRejectedValueOnce(insufficientFundsError);

    const res = await request(app).post("/transfer").send({
      fromUserId: "transfer-test-from-user",
      toUserId: "transfer-test-to-user",
      amount: 999,
    });

    createdIds.push(res.body._id);

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      status: "failed",
      metadata: { reason: "insufficient funds" },
    });

    const saved = await Transaction.findById(res.body._id);
    expect(saved.status).toBe("failed");
  });
});
