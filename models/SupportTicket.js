const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["feedback", "help"], required: true },
    category: { type: String },
    rating: { type: Number, min: 1, max: 5 },
    message: { type: String, required: true },
    screenshot: { type: String },
    status: { type: String, enum: ["open", "reviewed", "resolved"], default: "open" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", supportSchema);
