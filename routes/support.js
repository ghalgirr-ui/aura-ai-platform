const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { protect } = require("../middleware/authMiddleware");
const SupportTicket = require("../models/SupportTicket");

const router = express.Router();

// ensure uploads/support directory
const uploadDir = path.join(__dirname, "..", "uploads", "support");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [".png", ".jpg", ".jpeg", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) return cb(new Error("Invalid file type"), false);
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/submit", protect, upload.single("screenshot"), async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, rating, message, category } = req.body;

    if (!message || !message.trim()) return res.status(400).json({ error: "Message is required" });
    if (!type || !["feedback", "help"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const ticket = new SupportTicket({
      userId,
      type,
      rating: rating ? Number(rating) : undefined,
      message: message.trim(),
      category: category || undefined,
      screenshot: req.file ? `/uploads/support/${req.file.filename}` : undefined,
      status: "open",
    });

    await ticket.save();
    return res.status(201).json({ success: true, ticketId: ticket._id });
  } catch (error) {
    console.error("Support submit error:", error.message);
    return res.status(500).json({ error: "Failed to submit support request" });
  }
});

module.exports = router;
