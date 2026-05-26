const express = require("express");
const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const UserAnalytics = require("../models/UserAnalytics");
const Chat = require("../models/Chat");
const { protect } = require("../middleware/authMiddleware");
const { isAdmin } = require("../middleware/isAdmin");

const router = express.Router();

router.use(protect);
router.use(isAdmin);

// --------------------------
// Dashboard summary
// --------------------------
router.get("/dashboard", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const paidUsers = await User.countDocuments({ isPaid: true });
    const activeUsers = await UserAnalytics.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    const supportTickets = await SupportTicket.countDocuments();
    const totalChats = await Chat.countDocuments();
    const revenue = 0; // placeholder if payment records are not available

    res.json({ totalUsers, verifiedUsers, paidUsers, activeUsers, supportTickets, totalChats, revenue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

// Compatibility alias
router.get("/analytics/summary", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const paidUsers = await User.countDocuments({ isPaid: true });
    const activeUsers = await UserAnalytics.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    const revenue = 0;
    res.json({ totalUsers, verifiedUsers, paidUsers, activeUsers, revenue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch analytics summary" });
  }
});

// --------------------------
// Support tickets
// --------------------------
router.get("/support", async (req, res) => {
  try {
    const { type, status, q, limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (q) filter.$or = [
      { message: { $regex: q, $options: "i" } },
      { "userId.email": { $regex: q, $options: "i" } },
      { "userId.username": { $regex: q, $options: "i" } },
    ];

    const tickets = await SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .skip(parseInt(skip, 10))
      .populate("userId", "username email");
    const total = await SupportTicket.countDocuments(filter);
    res.json({ tickets, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

router.patch("/support/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { action, status } = req.body;

    if (action === "delete") {
      await SupportTicket.deleteOne({ _id: id });
      return res.json({ success: true });
    }

    const update = {};
    if (status) update.status = status;

    const ticket = await SupportTicket.findByIdAndUpdate(id, update, { new: true }).populate("userId", "username email");
    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// --------------------------
// Users
// --------------------------
router.get("/users", async (req, res) => {
  try {
    const { q, limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (q) {
      filter.$or = [
        { username: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("username email role isPaid isVerified createdAt")
      .limit(parseInt(limit, 10))
      .skip(parseInt(skip, 10))
      .sort({ createdAt: -1 });

    const usersWithAnalytics = await Promise.all(users.map(async (u) => {
      const analytics = await UserAnalytics.findOne({ userId: u._id });
      return {
        id: u._id,
        username: u.username,
        email: u.email,
        role: u.role,
        isPaid: u.isPaid,
        isVerified: u.isVerified,
        createdAt: u.createdAt,
        analytics: analytics || {},
      };
    }));

    const total = await User.countDocuments(filter);
    res.json({ users: usersWithAnalytics, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/users/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password -otp -otpExpiry");
    if (!user) return res.status(404).json({ error: "User not found" });

    const analytics = await UserAnalytics.findOne({ userId: user._id });
    const chatCount = await Chat.countDocuments({ userId: user._id });

    res.json({ user, analytics: analytics || {}, chatCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.patch("/users/:userId", async (req, res) => {
  try {
    const { role, isPaid } = req.body;
    const update = {};
    if (role) update.role = role;
    if (typeof isPaid === "boolean") update.isPaid = isPaid;

    const user = await User.findByIdAndUpdate(req.params.userId, update, { new: true }).select("-password -otp -otpExpiry");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// --------------------------
// Usage analytics
// --------------------------
router.get("/analytics", async (req, res) => {
  try {
    const { limit = 100, skip = 0 } = req.query;
    const analytics = await UserAnalytics.find()
      .populate("userId", "username email")
      .limit(parseInt(limit, 10))
      .skip(parseInt(skip, 10))
      .sort({ lastSeen: -1 });

    const usageTotals = analytics.reduce(
      (acc, item) => {
        acc.dashboardOpens += item.dashboardOpens || 0;
        acc.messagesSent += item.messagesSent || 0;
        acc.aiResponses += item.aiResponses || 0;
        acc.webSearchCount += item.webSearchCount || 0;
        acc.voiceCount += item.voiceCount || 0;
        acc.uploadCount += item.uploadCount || 0;
        acc.memoryCount += item.memoryCount || 0;
        return acc;
      },
      {
        dashboardOpens: 0,
        messagesSent: 0,
        aiResponses: 0,
        webSearchCount: 0,
        voiceCount: 0,
        uploadCount: 0,
        memoryCount: 0,
      }
    );

    res.json({ analytics, usageTotals, total: await UserAnalytics.countDocuments() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.get("/analytics/payments", async (req, res) => {
  try {
    const totalPaid = await User.countDocuments({ isPaid: true });
    const totalUsers = await User.countDocuments();
    const conversionRate = totalUsers > 0 ? ((totalPaid / totalUsers) * 100).toFixed(2) : "0.00";

    res.json({
      totalPaid,
      totalUsers,
      conversionRate: `${conversionRate}%`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch payment analytics" });
  }
});

module.exports = router;
