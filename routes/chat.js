const express = require("express");
const crypto = require("crypto");
const { body } = require("express-validator");
const router = express.Router();
const Chat = require("../models/Chat");
const { protect } = require("../middleware/authMiddleware");
const { chatLimiter } = require("../middleware/rateLimiter");
const { validateRequest } = require("../middleware/validateRequest");

const { handleAI } = require("../aiProvider");
const Memory = require("../models/Memory");
const { incrementAnalytics } = require("../services/analyticsService");
const logger = require("../utils/logger");

router.use(protect);
router.use(chatLimiter);

const getUserId = (req) => req.user._id.toString();

const sensitiveMemoryPatterns = [/password/i, /otp/i, /one[- ]time/i, /token/i, /secret/i, /credit card/i, /payment/i, /ssn/i, /social security/i];
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripTrailingPunctuation = (text) => text.trim().replace(/[.?!]+$/u, "").trim();

const parseMemoryCommand = (message) => {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (/^(show|display)\b.*\bmemories?\b/i.test(trimmed) || /\bwhat do i remember\b/i.test(lower) || /\bshow my memory\b/i.test(lower)) {
    return { action: "show" };
  }

  if (/^(clear|delete)\s+(all\s+)?memories?\b/i.test(trimmed) || /\bclear all memory\b/i.test(lower)) {
    return { action: "clear" };
  }

  const forgetMatch = trimmed.match(/^(forget|delete|remove)\s+(.+)/i);
  if (forgetMatch) {
    return { action: "forget", query: forgetMatch[2].trim() };
  }

  return null;
};

const containsSensitiveText = (text) => {
  return sensitiveMemoryPatterns.some((pattern) => pattern.test(text));
};

const normalizeMemoryValue = (text) => {
  if (!text) return "";
  return stripTrailingPunctuation(text).replace(/\s+/gu, " ");
};

const parseMemoryStatement = (message) => {
  if (!message || containsSensitiveText(message)) return null;

  const patterns = [
  {
    regex: /my name is ([a-zA-Z]+)\b/i,
    key: "Name",
    category: "personal",
  },
  {
    regex: /call me ([a-zA-Z]+)\b/i,
    key: "Name",
    category: "personal",
  },
  {
    regex: /i prefer ([a-zA-Z0-9#+.\- ]+?)(?:\.|,|$)/i,
    key: "Preferred Language",
    category: "preference",
  },
  {
    regex: /i use (.+?)(?:\.|,|$)/i,
    key: "Technology",
    category: "preference",
  },
  {
    regex: /i work with (.+?)(?:\.|,|$)/i,
    key: "Technology",
    category: "preference",
  },
  {
    regex: /i am building (.+?)(?:\.|,|$)/i,
    key: "Project",
    category: "context",
  },
  {
    regex: /i'm building (.+?)(?:\.|,|$)/i,
    key: "Project",
    category: "context",
  },
  {
    regex: /my project is (.+?)(?:\.|,|$)/i,
    key: "Project",
    category: "context",
  },
  {
    regex: /remember that (.+?)(?:\.|,|$)/i,
    key: "Preference",
    category: "preference",
  },
];

  for (const pattern of patterns) {
    const match = message.match(pattern.regex);
    if (match) {
      let value = normalizeMemoryValue(match[1]);
      if (!value) continue;
      value = value.replace(/^i\s+(like|love|enjoy|prefer)\s+/i, "").trim();
      value = value.replace(/^my\s+name\s+is\s+/i, "").trim();
      value = value.replace(/^call\s+me\s+/i, "").trim();
      if (!value) continue;
      return { key: pattern.key, value, category: pattern.category };
    }
  }

  return null;
};

const isGlobalMemory = (memory) => {
  if (!memory) return false;

  const globalKeys = [
    "Name",
    "Preferred Language",
    "Technology",
    "Preference"
  ];

  return globalKeys.includes(memory.key);
};

const saveUserMemory = async (userId, chatId, memory) => {
  if (!memory || containsSensitiveText(memory.value)) return null;

  const normalizedValue = normalizeMemoryValue(memory.value);
  if (!normalizedValue) return null;

  const global = isGlobalMemory(memory);

  return Memory.findOneAndUpdate(
    {
      userId,
      key: memory.key,
      scope: global ? "global" : "chat",
      chatId: global ? null : chatId,
    },
    {
      value: normalizedValue,
      category: memory.category,
      scope: global ? "global" : "chat",
      chatId: global ? null : chatId,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const fetchMemoryContext = async (userId, chatId) => {
  const globalMemories = await Memory.find({
    userId,
    scope: "global",
  }).lean();

  const chatMemories = await Memory.find({
    userId,
    scope: "chat",
    chatId,
  }).lean();

  return {
    globalMemories,
    chatMemories,
  };
};

const buildMemoryContextText = (memoryData) => {
  if (!memoryData) return "";

  const lines = [];

  if (memoryData.globalMemories?.length) {
    lines.push("User Profile Memory:");
    memoryData.globalMemories.forEach((mem) => {
      lines.push(`- ${mem.key}: ${mem.value}`);
    });
  }

  if (memoryData.chatMemories?.length) {
    lines.push("");
    lines.push("Current Chat Context:");
    memoryData.chatMemories.forEach((mem) => {
      lines.push(`- ${mem.key}: ${mem.value}`);
    });
  }

  return lines.join("\n");
};

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
    logger.error({ err }, "Failed to create chat");
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
    body("model").optional().isString().trim().withMessage("Invalid model."),
    body("mode").optional().isString().trim().isIn(["general", "coding", "research", "writing", "study", "startup"]).withMessage("Invalid mode."),
    body("webSearch").optional().isBoolean().withMessage("Invalid webSearch value."),
    body("chatId").optional().trim().escape(),
    body("regenerate").optional().isBoolean().withMessage("Invalid regenerate value."),
  ],
  validateRequest,
  async (req, res) => {
    let clientAborted = false;
    req.on("aborted", () => {
      clientAborted = true;
    });
    res.on("close", () => {
      if (!res.writableEnded) clientAborted = true;
    });

    try {
      const userId = getUserId(req);
      const { chatId, message, provider, model, mode, webSearch } = req.body;
      const regenerate = req.body.regenerate === true || req.body.regenerate === "true";

      if (!message?.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      const command = parseMemoryCommand(message);
      if (command) {
        let replyText = "";
        const analyticsCounters = {};

        if (command.action === "show") {
          analyticsCounters.memoryReads = 1;
          const memoryItems = await Memory.find({ userId }).sort({ updatedAt: -1 });
          if (memoryItems.length === 0) {
            replyText = "You don't have any saved memory yet.";
          } else {
            replyText = ["Here are your saved memories:", ...memoryItems.map((mem) => `- ${mem.key}: ${mem.value}`)].join("\n");
          }
        } else if (command.action === "clear") {
          analyticsCounters.memoryWrites = 1;
          await Memory.deleteMany({ userId });
          replyText = "All of your saved memory has been cleared.";
        } else if (command.action === "forget") {
          analyticsCounters.memoryWrites = 1;
          const query = command.query || "";
          const regex = new RegExp(escapeRegex(query), "i");
          const targetMemories = await Memory.find({
            userId,
            $or: [{ key: regex }, { value: regex }],
          });

          if (targetMemories.length === 0) {
            replyText = `I couldn't find any saved memory matching \"${query}\".`;
          } else {
            await Memory.deleteMany({ _id: { $in: targetMemories.map((mem) => mem._id) } });
            replyText = `Forgot ${targetMemories.map((mem) => mem.key).join(", ")}.`;
          }
        }

        const activeChatId = chatId || crypto.randomUUID();
        let chat = await Chat.findOne({ userId, chatId: activeChatId });
        if (!chat) {
          chat = new Chat({ userId, chatId: activeChatId, title: message.slice(0, 40), messages: [] });
        }

        chat.messages.push({ role: "user", content: message });
        chat.messages.push({ role: "assistant", content: replyText });
        await chat.save();
        await incrementAnalytics(userId, { messagesSent: 1, aiResponses: 1, ...analyticsCounters });

        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("X-Chat-Id", activeChatId);
        if (!res.writableEnded) res.write(replyText);
        if (!res.writableEnded) res.end();
        return;
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

    if (regenerate && chat.messages.at(-1)?.role === "assistant") {
      chat.messages.pop();
    }

    if (!regenerate) {
      chat.messages.push({
        role: "user",
        content: message,
      });
    }

    const memoryStatement = parseMemoryStatement(message);
    if (memoryStatement) {
      await saveUserMemory(userId, activeChatId, memoryStatement);
      await incrementAnalytics(userId, { memoryWrites: 1 });
    }

    if (chat.messages.length === 1 && chat.title === "New Chat") {
      chat.title = message.slice(0, 40);
    }

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("X-Chat-Id", activeChatId);

    try {
      const userMemories = await fetchMemoryContext(userId, activeChatId);
      logger.debug({ provider, model, mode, webSearch }, "Calling AI provider");
      const reply = await handleAI(provider, chat, message, res, {
        isAborted: () => clientAborted || req.aborted || res.writableEnded,
        model: model || provider, // Use model ID if provided, else use provider as fallback
        mode: mode || "general",
        webSearch: webSearch === true || webSearch === "true",
        userMemory: userMemories,
      });
      logger.debug({ length: reply.length }, "AI response received");

      if (clientAborted || req.aborted || res.writableEnded) return;

      chat.messages.push({
        role: "assistant",
        content: reply,
      });

      await chat.save();
      await incrementAnalytics(
        userId,
        {
          messagesSent: regenerate ? 0 : 1,
          aiResponses: 1,
          webSearchCount: webSearch === true || webSearch === "true" ? 1 : 0,
        },
        { mode: mode || "general", model: model || provider || "aura" }
      );
    } catch (aiError) {
      logger.error({ err: aiError }, "AI Error");
      if (!clientAborted && !res.writableEnded) res.write("AI service error occurred");
    }

    if (!res.writableEnded) res.end();
  } catch (error) {
    logger.error({ err: error }, "Chat route error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Something went wrong" });
    } else if (!res.writableEnded) {
      res.end();
    }
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
