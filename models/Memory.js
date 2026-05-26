const mongoose = require("mongoose");

const memorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    chatId: {
      type: String,
      default: null,
      index: true,
    },

    scope: {
      type: String,
      enum: ["global", "chat"],
      default: "global",
      required: true,
    },

    key: {
      type: String,
      required: true,
      trim: true,
    },

    value: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      default: "preference",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate same-scope memory
memorySchema.index(
  {
    userId: 1,
    chatId: 1,
    scope: 1,
    key: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model("Memory", memorySchema);