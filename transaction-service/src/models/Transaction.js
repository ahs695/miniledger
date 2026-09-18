const mongoose = require("mongoose");
const { Schema } = mongoose;

const transactionSchema = new Schema({
  fromWalletId: { type: String, required: true },
  toWalletId: { type: String, required: true },
  amount: { type: Number, required: true, min: 0.01 },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  idempotencyKey: { type: String, required: true, unique: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  completedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);
