const express = require("express");
const crypto = require("crypto");
const { body } = require("express-validator");
const router = express.Router();
const Chat = require("../models/Chat");
const { protect } = require("../middleware/authMiddleware");
const { chatLimiter } = require("../middleware/rateLimiter");
const { validateRequest } = require("../middleware/validateRequest");

const { handleAI } = require("../aiProvider");

console.log("handleAI type:", typeof handleAI);
console.log("handleAI:", handleAI);

router.use(protect);
router.use(chatLimiter);

const getUserId = (req) => req.user._id.toString();

/* =========================
   CREATE NEW CHAT
========================= */
router.post("/new", async (req, res) => {
  try {
    const chatId = crypto.randomUUID();

    const newChat = new Chat({
      userId: getUserId(req),
      chatId,
      title: "New Chat",
      messages: [],
    });

    await newChat.save();

    res.json(newChat);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create chat" });
  }
});

/* =========================
   SEND MESSAGE (MULTI-AI STREAMING)
========================= */
router.post(
  "/",
  [
    body("message").trim().notEmpty().withMessage("Message is required.").isLength({ max: 1500 }).withMessage("Message cannot exceed 1500 characters."),
    body("provider").optional().isIn(["openrouter", "gemini"]).withMessage("Invalid provider."),
    body("chatId").optional().trim().escape(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { chatId, message, provider } = req.body;

      if (!message?.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

    const activeChatId = chatId || crypto.randomUUID();
    let chat = await Chat.findOne({ userId, chatId: activeChatId });

    if (!chat) {
      chat = new Chat({
        userId,
        chatId: activeChatId,
        title: message.slice(0, 40),
        messages: [],
      });
    }

    chat.messages.push({
      role: "user",
      content: message,
    });

    if (chat.messages.length === 1 && chat.title === "New Chat") {
      chat.title = message.slice(0, 40);
    }

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("X-Chat-Id", activeChatId);

    try {
      console.log("Calling AI provider:", provider);
      const reply = await handleAI(provider, chat, message, res);
      console.log("AI response received, length:", reply.length);

      chat.messages.push({
        role: "assistant",
        content: reply,
      });

      await chat.save();
      console.log("Chat saved successfully");
    } catch (aiError) {
      console.error("AI Error:", aiError);
      res.write("AI service error occurred");
    }

    res.end();
  } catch (error) {
    console.error("ERROR:", error.response?.data || error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* =========================
   GET ALL CHATS FOR SIGNED-IN USER
========================= */
router.get("/", async (req, res) => {
  try {
    const chats = await Chat.find({ userId: getUserId(req) }).sort({ updatedAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

/* =========================
   BACKWARD-COMPATIBLE CHAT LIST
========================= */
router.get("/list/:userId", async (req, res) => {
  try {
    const chats = await Chat.find({ userId: getUserId(req) }).sort({ updatedAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

/* =========================
   GET SINGLE CHAT
========================= */
router.get("/:chatId", async (req, res) => {
  try {
    const chat = await Chat.findOne({
      userId: getUserId(req),
      chatId: req.params.chatId,
    });

    res.json(chat || { messages: [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

/* =========================
   RENAME CHAT
========================= */
router.put("/:chatId", async (req, res) => {
  try {
    const title = req.body.title?.trim();
    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await Chat.updateOne(
      { userId: getUserId(req), chatId: req.params.chatId },
      { title: title.slice(0, 80) }
    );

    if (!result.matchedCount) {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Rename failed" });
  }
});

/* =========================
   DELETE CHAT
========================= */
router.delete("/:chatId", async (req, res) => {
  try {
    await Chat.deleteOne({
      userId: getUserId(req),
      chatId: req.params.chatId,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;
