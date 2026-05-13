const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["user", "assistant"],
  },
  content: String,
  file: {
    type: {
      type: String,
      enum: ["image", "pdf"],
    },
    originalName: String,
    mimeType: String,
    size: Number,
    path: String,
    url: String,
    extractedText: String,
    analyzed: Boolean,
  },
});

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    chatId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: "New Chat",
    },
    messages: [messageSchema],
  },
  {
    timestamps: true,
  }
);

// ✅ INDEX (VERY IMPORTANT FOR PERFORMANCE)
chatSchema.index({ userId: 1, chatId: 1 });

module.exports = mongoose.model("Chat", chatSchema);