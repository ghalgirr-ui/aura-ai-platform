const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization token required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    if (!process.env.JWT_SECRET) {
      logger.error("JWT_SECRET is not configured");
      return res.status(500).json({ error: "Authentication is not configured" });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select("-password -otp -otpExpiry");

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: "Account not verified" });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.warn({ err: error }, "Auth middleware error");
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

module.exports = { protect };
