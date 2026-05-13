const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body } = require("express-validator");
const transporter = require("../config/mail");
const User = require("../models/User");
const { authLimiter } = require("../middleware/rateLimiter");
const { validateRequest } = require("../middleware/validateRequest");

const router = express.Router();
const OTP_EXPIRY_MINUTES = 10;

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const publicUser = (user) => ({
  id: user._id.toString(),
  username: user.username,
  email: user.email,
  isVerified: user.isVerified,
});

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const sendOtpEmail = async (email, otp) => {
  const emailConfigured =
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS &&
    process.env.EMAIL_USER !== "yourgmail@gmail.com" &&
    process.env.EMAIL_PASS !== "your_app_password";

  if (!emailConfigured) {
    console.log(`Aura OTP for ${email}: ${otp}`);
    return;
  }

  await transporter.sendMail({
    from: `"Aura" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Aura OTP Verification",
    html: `
      <h2>Aura Account Verification</h2>
      <p>Your verification code is: <strong>${otp}</strong></p>
      <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
    `,
  });
};

router.get("/", (req, res) => {
  res.send("Auth Route Working");
});

router.post(
  "/signup",
  authLimiter,
  [
    body("username").trim().notEmpty().withMessage("Username is required").isLength({ min: 2 }).withMessage("Username must be at least 2 characters."),
    body("email").trim().isEmail().withMessage("A valid email is required.").normalizeEmail(),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters."),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const username = req.body.username?.trim();
      const email = req.body.email?.trim().toLowerCase();
      const password = req.body.password?.trim();

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Please provide username, email and password." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser?.isVerified) {
      return res.status(409).json({ error: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const user = existingUser || new User({ email });

    user.username = username;
    user.password = hashedPassword;
    user.isVerified = false;
    user.otp = otp;
    user.otpExpiry = otpExpiry;

    await user.save();
    await sendOtpEmail(email, otp);

    return res.status(201).json({
      message: "Signup successful. Check your email for the OTP code.",
      email: user.email,
      userId: user._id.toString(),
      devOtp: process.env.NODE_ENV === "production" ? undefined : otp,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: "Signup failed." });
  }
});

router.post(
  "/verify",
  authLimiter,
  [
    body("email").trim().isEmail().withMessage("A valid email is required.").normalizeEmail(),
    body("otp").trim().isNumeric().withMessage("OTP must only contain numbers.").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits."),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const email = req.body.email?.trim().toLowerCase();
      const otp = req.body.otp?.trim();

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or OTP." });
    }

    if (user.isVerified) {
      const token = generateToken(user);
      return res.json({
        success: true,
        message: "Account already verified.",
        token,
        user: publicUser(user),
      });
    }

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ error: "OTP is not available. Please request a new code." });
    }

    if (user.otpExpiry < new Date()) {
      return res.status(400).json({ error: "OTP has expired. Please request a new code." });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP code." });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = generateToken(user);

    return res.json({
      success: true,
      message: "Account verified successfully.",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Verify error:", error);
    return res.status(500).json({ error: "OTP verification failed." });
  }
});

router.post(
  "/resend-otp",
  authLimiter,
  [
    body("email").trim().isEmail().withMessage("A valid email is required.").normalizeEmail(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const email = req.body.email?.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: "Account already verified." });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await user.save();
    await sendOtpEmail(email, otp);

    return res.json({
      message: "A new OTP has been sent.",
      devOtp: process.env.NODE_ENV === "production" ? undefined : otp,
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({ error: "Unable to resend OTP." });
  }
});

router.post(
  "/login",
  authLimiter,
  [
    body("email").trim().isEmail().withMessage("A valid email is required.").normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required."),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const email = req.body.email?.trim().toLowerCase();
      const password = req.body.password?.trim();

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: "Please verify your account before login." });
    }

    const token = generateToken(user);

    return res.json({
      success: true,
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Login failed." });
  }
});

module.exports = router;
