const mongoose = require("mongoose");

const analyticsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    loginCount: { type: Number, default: 0 },
    dashboardOpens: { type: Number, default: 0 },
    totalTimeSpent: { type: Number, default: 0 }, // seconds
    messagesSent: { type: Number, default: 0 },
    aiResponses: { type: Number, default: 0 },
    webSearchCount: { type: Number, default: 0 },
    voiceCount: { type: Number, default: 0 },
    uploadCount: { type: Number, default: 0 },
    memoryCount: { type: Number, default: 0 },
    lastSeen: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserAnalytics", analyticsSchema);
