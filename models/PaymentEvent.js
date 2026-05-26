const mongoose = require("mongoose");

const paymentEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    email: { type: String, trim: true, lowercase: true, index: true },
    username: { type: String, trim: true },
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["created", "attempted", "paid", "failed"],
      default: "created",
      index: true,
    },
    receipt: { type: String },
    attempts: { type: Number, default: 0 },
    raw: { type: mongoose.Schema.Types.Mixed },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentEvent", paymentEventSchema);
