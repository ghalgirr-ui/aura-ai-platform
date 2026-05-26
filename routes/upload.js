const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pdfParse = require("pdf-parse");
const { body } = require("express-validator");
const Chat = require("../models/Chat");
const { protect } = require("../middleware/authMiddleware");
const { imageUpload, pdfUpload, verifyMagicBytes } = require("../middleware/uploadMiddleware");
const { uploadLimiter } = require("../middleware/rateLimiter");
const { validateRequest } = require("../middleware/validateRequest");
const { analyzeImageWithGemini, analyzeTextWithGemini } = require("../aiProvider");
const { incrementAnalytics } = require("../services/analyticsService");
const logger = require("../utils/logger");

const router = express.Router();
router.use(protect);
router.use(uploadLimiter);

const getUserId = (req) => req.user._id.toString();

const createOrLoadChat = async (userId, chatId, firstMessage) => {
  let chat = await Chat.findOne({ userId, chatId });
  if (!chat) {
    chat = new Chat({
      userId,
      chatId,
      title: firstMessage.slice(0, 40),
      messages: [],
    });
  }
  return chat;
};

const cleanupUpload = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    logger.warn({ err: error }, "Upload cleanup failed");
  }
};

const buildFileMeta = (file, type) => ({
  type,
  originalName: file.originalname,
  mimeType: file.mimetype,
  size: file.size,
});

router.post(
  "/image",
  [
    body("question").optional().trim().isLength({ max: 1000 }).withMessage("Question cannot exceed 1000 characters."),
    body("chatId").optional().trim().escape(),
  ],
  validateRequest,
  (req, res) => {
    imageUpload(req, res, async (err) => {
      try {
        if (err) {
          const message = err.message === "Unsupported file type"
            ? "Only PNG, JPG, JPEG and WEBP images are supported."
            : "Image upload failed.";
          if (req.file?.path) await cleanupUpload(req.file.path);
          return res.status(400).json({ error: message });
        }

        if (!req.file) {
          return res.status(400).json({ error: "Image file is required." });
        }

        if (!(await verifyMagicBytes(req.file.path, "image"))) {
          await cleanupUpload(req.file.path);
          return res.status(400).json({ error: "Invalid or disguised image file." });
        }

        const question = (req.body.question || "Please analyze the attached image.").trim();
        const userId = getUserId(req);
        const chatId = req.body.chatId || crypto.randomUUID();
        const fileMeta = buildFileMeta(req.file, "image");

        const chat = await createOrLoadChat(userId, chatId, question);
        chat.messages.push({
          role: "user",
          content: question,
          file: fileMeta,
        });

        const analysis = await analyzeImageWithGemini(req.file.path, question);
        const reply = analysis || "I could not analyze the image. Please try again.";

        chat.messages.push({
          role: "assistant",
          content: reply,
          file: { ...fileMeta, analyzed: true },
        });

        await chat.save();
        await incrementAnalytics(userId, { uploadCount: 1, aiResponses: 1 });
        return res.json({
          success: true,
          chatId: chat.chatId,
          message: reply,
          file: fileMeta,
        });
      } catch (error) {
        logger.error({ err: error }, "Image upload route error");
        return res.status(500).json({ error: "Unable to process image." });
      } finally {
        if (req.file?.path) await cleanupUpload(req.file.path);
      }
    });
  }
);

router.post(
  "/pdf",
  [
    body("question").optional().trim().isLength({ max: 1000 }).withMessage("Question cannot exceed 1000 characters."),
    body("chatId").optional().trim().escape(),
  ],
  validateRequest,
  (req, res) => {
    pdfUpload(req, res, async (err) => {
      try {
        if (err) {
          const message = err.message === "Unsupported file type"
            ? "Only PDF files are supported."
            : "PDF upload failed.";
          if (req.file?.path) await cleanupUpload(req.file.path);
          return res.status(400).json({ error: message });
        }

        if (!req.file) {
          return res.status(400).json({ error: "PDF file is required." });
        }

        if (!(await verifyMagicBytes(req.file.path, "pdf"))) {
          await cleanupUpload(req.file.path);
          return res.status(400).json({ error: "Invalid or disguised PDF file." });
        }

        const question = (req.body.question || "Please summarize the uploaded document.").trim();
        const userId = getUserId(req);
        const chatId = req.body.chatId || crypto.randomUUID();
        const fileMeta = buildFileMeta(req.file, "pdf");

        const dataBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(dataBuffer);
        const extractedText = (pdfData.text || "").slice(0, 20000);

        const chat = await createOrLoadChat(userId, chatId, question);
        chat.messages.push({
          role: "user",
          content: question,
          file: { ...fileMeta, extractedText: extractedText.slice(0, 5000) },
        });

        const analysis = await analyzeTextWithGemini(extractedText, question);
        const reply = analysis || "I could not analyze the document. Please try again.";

        chat.messages.push({
          role: "assistant",
          content: reply,
          file: { ...fileMeta, analyzed: true },
        });

        await chat.save();
        await incrementAnalytics(userId, { uploadCount: 1, aiResponses: 1 });
        return res.json({
          success: true,
          chatId: chat.chatId,
          message: reply,
          file: fileMeta,
        });
      } catch (error) {
        logger.error({ err: error }, "PDF upload route error");
        return res.status(500).json({ error: "Unable to process PDF." });
      } finally {
        if (req.file?.path) await cleanupUpload(req.file.path);
      }
    });
  }
);

module.exports = router;
