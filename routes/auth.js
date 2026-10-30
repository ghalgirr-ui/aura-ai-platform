const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { body } = require("express-validator");
const Razorpay = require("razorpay");
// const transporter = require("../config/mail");
const sendEmail = require("../config/mail");
// const { Resend } = require("resend");
const User = require("../models/User");
const PaymentEvent = require("../models/PaymentEvent");
const { authLimiter, passwordResetLimiter, paymentLimiter } = require("../middleware/rateLimiter");
const { validateRequest } = require("../middleware/validateRequest");
const { protect } = require("../middleware/authMiddleware");
const { incrementAnalytics } = require("../services/analyticsService");
const logger = require("../utils/logger");

const router = express.Router();
const OTP_EXPIRY_MINUTES = 10;
const PASSWORD_RESET_EXPIRY_MINUTES = 15;
const PASSWORD_RESET_EXPIRY_MS = PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000;
const PASSWORD_RESET_RESPONSE = "If an account exists for that email, a password reset link will be sent shortly.";
const SIGNUP_PRICE_PAISE = Number(process.env.SIGNUP_PRICE_PAISE || 200);

const sanitizeMailErrorValue = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  let sanitized = value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
    .replace(/\b[a-f0-9]{64}\b/gi, "[redacted token]")
    .slice(0, 500);

  const apiKey = process.env.BREVO_API_KEY;
  if (apiKey) {
    sanitized = sanitized.split(apiKey).join("[redacted API key]");
  }

  return sanitized;
};

const getMailErrorDetails = (error) => {
  const causes = [
    error,
    error && error.cause,
    ...(error && Array.isArray(error.errors) ? error.errors : []),
  ].filter(Boolean);
  const details = {
    errorType: error && error.name ? error.name : "Error",
    errorMessage: sanitizeMailErrorValue(
      error && error.message ? error.message : "Unknown email delivery error"
    ),
  };
  const response = causes.map((cause) => cause.response).find(Boolean);
  const status = (response && response.status) || causes.map((cause) => cause.status).find(Number.isInteger);
  const networkError = causes.find((cause) => typeof cause.code === "string");

  if (Number.isInteger(status)) {
    details.httpStatus = status;
  }
  if (Number.isInteger(status) && status >= 400) {
    details.failureCategory = "brevo_http_error";
  } else if (networkError) {
    details.errorCode = sanitizeMailErrorValue(networkError.code);
    if (typeof networkError.syscall === "string") {
      details.networkSyscall = sanitizeMailErrorValue(networkError.syscall);
    }
    if (
      typeof networkError.hostname === "string" &&
      /^[a-z0-9.-]+$/i.test(networkError.hostname)
    ) {
      details.networkHostname = networkError.hostname;
    }
    if (["ENOTFOUND", "EAI_AGAIN"].includes(networkError.code)) {
      details.failureCategory = "dns_lookup_failed";
    } else if (networkError.code === "ECONNRESET") {
      details.failureCategory = "connection_reset";
    } else if (
      ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "ECONNABORTED"].includes(networkError.code)
    ) {
      details.failureCategory = "connection_timeout";
    } else {
      details.failureCategory = "network_error";
    }
  }

  const responseBody = response && response.body;
  if (responseBody && typeof responseBody === "object") {
    const safeBody = {};
    for (const key of ["code", "message", "error", "error_description"]) {
      if (typeof responseBody[key] === "string" || typeof responseBody[key] === "number") {
        safeBody[key] = sanitizeMailErrorValue(String(responseBody[key]));
      }
    }
    if (Object.keys(safeBody).length > 0) {
      details.brevoResponse = safeBody;
    }
  } else if (response && typeof response.text === "string") {
    details.brevoResponse = sanitizeMailErrorValue(response.text);
  }

  return details;
};

// ✅ Lazy Initialize Razorpay (only when keys are available)
const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env");
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role || "user",
      sessionVersion: user.sessionVersion || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const publicUser = (user) => ({
  id: user._id.toString(),
  name: user.name || user.username,
  username: user.username,
  email: user.email,
  role: user.role || "user",
  isVerified: user.isVerified,
});

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

// const { Resend } = require("resend");

// const resend = new Resend(process.env.RESEND_API_KEY);

const sendOtpEmail = async (email, otp) => {
  await sendEmail(
    email,
    "Aura OTP Verification",
    `
      <h2>Aura Account Verification</h2>
      <p>Your verification code is: <strong>${otp}</strong></p>
      <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
    `
  );

  logger.info({ email }, "OTP email sent successfully");
};
router.get("/", (req, res) => {
  res.send("Auth Route Working");
});

router.get("/me", protect, (req, res) => {
  return res.json({ user: publicUser(req.user) });
});

router.post(
  "/forgot-password",
  passwordResetLimiter,
  [
    body("email").trim().isEmail().withMessage("A valid email is required.").normalizeEmail(),
  ],
  validateRequest,
  (req, res) => {
    const email = req.body.email?.trim().toLowerCase();

    setImmediate(async () => {
      let stage = "user_lookup";
      try {
        const user = await User.findOne({ email, isVerified: true }).select("_id");
        if (!user) {
          return;
        }

        stage = "frontend_url_validation";
        const configuredFrontendUrl = process.env.FRONTEND_URL;
        if (!configuredFrontendUrl) {
          logger.error("FRONTEND_URL is not configured; password reset email cannot be sent");
          return;
        }

        let frontendUrl;
        try {
          frontendUrl = new URL(configuredFrontendUrl);
        } catch {
          logger.error("FRONTEND_URL is invalid; password reset email cannot be sent");
          return;
        }

        if (
          !["http:", "https:"].includes(frontendUrl.protocol) ||
          (process.env.NODE_ENV === "production" && frontendUrl.protocol !== "https:") ||
          frontendUrl.username ||
          frontendUrl.password
        ) {
          logger.error("FRONTEND_URL must be an HTTP(S) URL without credentials and use HTTPS in production");
          return;
        }

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

        stage = "reset_token_persistence";
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              passwordResetTokenHash: tokenHash,
              passwordResetExpires: expiresAt,
            },
          }
        );

        const resetUrl = new URL("/reset-password.html", frontendUrl.origin);
        resetUrl.hash = new URLSearchParams({ token: rawToken }).toString();

        stage = "brevo_send";
        await sendEmail(
          email,
          "Reset your Aura AI password",
          `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#f8f8ff;background:#111020;border:1px solid #39255f;border-radius:20px">
              <p style="margin:0 0 8px;color:#c084fc;font-size:13px;font-weight:bold;letter-spacing:3px;text-transform:uppercase">Aura AI</p>
              <h1 style="margin:0 0 16px;font-size:26px">Reset your password</h1>
              <p style="color:#d1d5db;line-height:1.6">We received a request to reset the password for your Aura AI account. Use the button below to choose a new password.</p>
              <p style="margin:28px 0">
                <a href="${resetUrl.href}" style="display:inline-block;padding:13px 22px;color:#fff;text-decoration:none;font-weight:bold;background:linear-gradient(135deg,#8b5cf6,#ec4899);border-radius:10px">Reset password</a>
              </p>
              <p style="color:#c4b5fd;line-height:1.6">This link expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes and can only be used once.</p>
              <p style="color:#9ca3af;line-height:1.6">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
            </div>
          `
        );

        logger.info("Password reset email sent");
      } catch (error) {
        logger.error({ stage, ...getMailErrorDetails(error) }, "Password reset processing failed");
      }
    });

    return res.status(202).json({ message: PASSWORD_RESET_RESPONSE });
  }
);

router.post(
  "/verify-reset-token",
  passwordResetLimiter,
  [
    body("token")
      .isString()
      .isLength({ min: 64, max: 64 })
      .isHexadecimal()
      .withMessage("A valid reset token is required."),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.body.token).digest("hex");
      const user = await User.findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: { $gt: new Date() },
      }).select("_id");

      if (!user) {
        return res.status(400).json({ error: "This password reset link is invalid or has expired." });
      }

      return res.json({ success: true, valid: true });
    } catch (error) {
      logger.error(
        { errorType: error && error.name ? error.name : "Error" },
        "Password reset token verification failed"
      );
      return res.status(500).json({ error: "Unable to verify this password reset link." });
    }
  }
);

router.post(
  "/reset-password",
  passwordResetLimiter,
  [
    body("token")
      .isString()
      .isLength({ min: 64, max: 64 })
      .isHexadecimal()
      .withMessage("A valid reset token is required."),
    body("password")
      .isString()
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters.")
      .custom((password) => Buffer.byteLength(password, "utf8") <= 72)
      .withMessage("Password must not exceed 72 UTF-8 bytes."),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.body.token).digest("hex");
      const passwordHash = await bcrypt.hash(req.body.password, 12);
      const result = await User.updateOne(
        {
          passwordResetTokenHash: tokenHash,
          passwordResetExpires: { $gt: new Date() },
        },
        {
          $set: { password: passwordHash },
          $inc: { sessionVersion: 1 },
          $unset: {
            passwordResetTokenHash: 1,
            passwordResetExpires: 1,
          },
        }
      );

      if (result.modifiedCount !== 1) {
        return res.status(400).json({ error: "This password reset link is invalid or has expired." });
      }

      return res.json({
        success: true,
        message: "Password updated successfully. Please sign in with your new password.",
      });
    } catch (error) {
      logger.error(
        { errorType: error && error.name ? error.name : "Error" },
        "Password reset failed"
      );
      return res.status(500).json({ error: "Unable to reset your password right now." });
    }
  }
);

/* =========================
   💳 RAZORPAY: CREATE ORDER
========================= */
router.post(
  "/create-order",
  paymentLimiter,
  [
    body("email").trim().isEmail().withMessage("A valid email is required.").normalizeEmail(),
    body("username").trim().notEmpty().withMessage("Username is required").isLength({ min: 2 }).withMessage("Username must be at least 2 characters."),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters."),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const email = req.body.email?.trim().toLowerCase();
      const username = req.body.username?.trim();

      if (!email || !username) {
        return res.status(400).json({ error: "Username and email are required to create a payment order." });
      }

      // Check if user already exists and is verified
      const existingUser = await User.findOne({ email });
      if (existingUser?.isVerified) {
        return res.status(409).json({ error: "Email already registered. Please login." });
      }

      const razorpay = getRazorpay();
      const amount = Math.round(Number(process.env.SIGNUP_PRICE_PAISE || 200));
      console.log("Razorpay key:", !!process.env.RAZORPAY_KEY_ID);
      console.log("Razorpay secret:", !!process.env.RAZORPAY_KEY_SECRET);
      console.log("Razorpay order amount:", amount);

      if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(500).json({ error: "Invalid payment amount configuration." });
      }

      const options = {
        amount,
        currency: "INR",
        receipt: `aura_signup_${Date.now()}`,
        notes: { email, username },
      };

      const order = await razorpay.orders.create(options);

      if (!order || !order.id) {
        return res.status(500).json({ error: "Failed to create payment order." });
      }

      await PaymentEvent.findOneAndUpdate(
        { orderId: order.id },
        {
          email,
          username,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: "created",
          raw: { order },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );

      logger.info({ orderId: order.id, email }, "Razorpay order created");

      return res.json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        keyId: process.env.RAZORPAY_KEY_ID,
        email: email,
        username: username,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          razorpayKeyLoaded: !!process.env.RAZORPAY_KEY_ID,
          razorpaySecretLoaded: !!process.env.RAZORPAY_KEY_SECRET,
          amount: Number(process.env.SIGNUP_PRICE_PAISE || 200),
        },
        "Create order error"
      );
      return res.status(500).json({ error: "Payment order creation failed." });
    }
  }
);

/* =========================
   🔧 DEVELOPMENT: SIMULATE PAYMENT SUCCESS (LOCAL ONLY)
   POST /api/auth/dev-payment-success
   - Only active when NODE_ENV === "development"
   - Accepts optional `razorpay_order_id`, and requires username,email,password
   - Marks payment as paid and continues signup flow (creates user, sends OTP)
========================= */
router.post(
  "/dev-payment-success",
  paymentLimiter,
  [
    body("email").trim().isEmail().withMessage("A valid email is required.").normalizeEmail(),
    body("username").trim().notEmpty().withMessage("Username is required").isLength({ min: 2 }).withMessage("Username must be at least 2 characters."),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters."),
  ],
  validateRequest,
  async (req, res) => {
    try {
      if (process.env.NODE_ENV !== "development") {
        return res.status(403).json({ error: "Not allowed in this environment." });
      }

      const email = req.body.email?.trim().toLowerCase();
      const username = req.body.username?.trim();
      const password = req.body.password;
      const providedOrderId = req.body.razorpay_order_id?.trim();

      // Locate or create a PaymentEvent for this dev flow
      let orderId = providedOrderId;
      let paymentRecord = null;

      if (orderId) {
        paymentRecord = await PaymentEvent.findOne({ orderId });
      }

      if (!paymentRecord) {
        // create a fake order record representing a successful paid order
        orderId = orderId || `dev_order_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        const paymentId = `dev_pay_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

        paymentRecord = new PaymentEvent({
          orderId,
          paymentId,
          email,
          username,
          amount: SIGNUP_PRICE_PAISE,
          currency: "INR",
          receipt: `dev_receipt_${Date.now()}`,
          status: "paid",
          verifiedAt: new Date(),
          raw: { dev: true },
        });

        await paymentRecord.save();
      } else {
        // mark existing record as paid
        paymentRecord.status = "paid";
        paymentRecord.verifiedAt = new Date();
        paymentRecord.raw = { ...paymentRecord.raw, dev: true };
        await paymentRecord.save();
      }

      // Now create or update the user similar to real verify-payment flow
      let user = await User.findOne({ email });
      if (user?.isVerified) {
        return res.status(409).json({ error: "Email already registered." });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const otp = generateOtp();
      const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      if (!user) {
        user = new User({
          username,
          email,
          password: hashedPassword,
          otp,
          otpExpiry,
          isVerified: false,
          isPaid: true,
          paymentOrderId: orderId,
          paymentId: paymentRecord.paymentId || undefined,
        });
      } else {
        user.username = username;
        user.password = hashedPassword;
        user.otp = otp;
        user.otpExpiry = otpExpiry;
        user.isVerified = false;
        user.isPaid = true;
        user.paymentOrderId = orderId;
        user.paymentId = paymentRecord.paymentId || undefined;
      }

      await user.save();

      await PaymentEvent.updateOne(
        { orderId },
        {
          status: "paid",
          userId: user._id,
          paymentId: paymentRecord.paymentId || undefined,
          verifiedAt: new Date(),
          raw: { dev: true },
        }
      );

      await sendOtpEmail(email, otp);

      return res.status(201).json({
        success: true,
        message: "(DEV) Payment simulated: Account created. Check email for OTP.",
        email: user.email,
        userId: user._id.toString(),
        devOtp: otp,
        orderId,
      });
    } catch (error) {
      logger.error({ err: error }, "Dev payment simulation error");
      return res.status(500).json({ error: "Dev payment simulation failed." });
    }
  }
);

/* =========================
   ✅ RAZORPAY: VERIFY PAYMENT & CREATE USER
========================= */
router.post(
  "/verify-payment",
  paymentLimiter,
  [
    body("razorpay_order_id").trim().notEmpty().withMessage("Order ID is required."),
    body("razorpay_payment_id").trim().notEmpty().withMessage("Payment ID is required."),
    body("razorpay_signature").trim().notEmpty().withMessage("Signature is required."),
    body("email").trim().isEmail().withMessage("A valid email is required.").normalizeEmail(),
    body("username").trim().notEmpty().withMessage("Username is required").isLength({ min: 2 }).withMessage("Username must be at least 2 characters."),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters."),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      const email = req.body.email?.trim().toLowerCase();
      const username = req.body.username?.trim();
      const password = req.body.password;

      // ✅ Verify Razorpay signature
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");

      const expectedBuffer = Buffer.from(expectedSignature);
      const actualBuffer = Buffer.from(razorpay_signature);
      const signatureMatches =
        expectedBuffer.length === actualBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, actualBuffer);

      await PaymentEvent.findOneAndUpdate(
        { orderId: razorpay_order_id },
        { $inc: { attempts: 1 }, $set: { status: "attempted", paymentId: razorpay_payment_id } }
      );

      if (!signatureMatches) {
        logger.warn({ orderId: razorpay_order_id }, "Invalid Razorpay signature");
        return res.status(400).json({ error: "Payment verification failed. Invalid signature." });
      }


      const paymentRecord = await PaymentEvent.findOne({ orderId: razorpay_order_id });
      if (!paymentRecord) {
        return res.status(400).json({ error: "Payment order not found. Please restart signup." });
      }

      if (paymentRecord.status === "paid" || paymentRecord.userId) {
        return res.status(409).json({ error: "This payment has already been used." });
      }

      if (paymentRecord.email !== email || paymentRecord.amount !== SIGNUP_PRICE_PAISE) {
        return res.status(400).json({ error: "Payment order does not match signup details." });
      }

      const razorpay = getRazorpay();
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      if (
        !payment ||
        payment.order_id !== razorpay_order_id ||
        payment.amount !== SIGNUP_PRICE_PAISE ||
        payment.currency !== "INR" ||
        !["captured", "authorized"].includes(payment.status)
      ) {
        await PaymentEvent.updateOne({ orderId: razorpay_order_id }, { status: "failed", raw: { payment } });
        return res.status(400).json({ error: "Payment is not confirmed by Razorpay." });
      }

      logger.info({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, email }, "Payment verified");
      // Check if user exists
      let user = await User.findOne({ email });
      if (user?.isVerified) {
        return res.status(409).json({ error: "Email already registered." });
      }

      // Hash password and generate OTP
      const hashedPassword = await bcrypt.hash(password, 12);
      const otp = generateOtp();
      const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      // Create or update user (unverified with OTP)
      if (!user) {
        user = new User({
          username,
          email,
          password: hashedPassword,
          otp,
          otpExpiry,
          isVerified: false,
          isPaid: true,
          paymentOrderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
        });
      } else {
        user.username = username;
        user.password = hashedPassword;
        user.otp = otp;
        user.otpExpiry = otpExpiry;
        user.isVerified = false;
        user.isPaid = true;
        user.paymentOrderId = razorpay_order_id;
        user.paymentId = razorpay_payment_id;
      }

      await user.save();

await PaymentEvent.updateOne(
  { orderId: razorpay_order_id },
  {
    status: "paid",
    userId: user._id,
    paymentId: razorpay_payment_id,
    verifiedAt: new Date(),
    raw: { payment },
  }
);

let emailFailed = false;

try {
  await sendOtpEmail(email, otp);
} catch (err) {
  emailFailed = true;
  logger.error({ err }, "OTP email failed, but payment/user creation succeeded");
}

    return res.status(201).json({
  success: true,
  message: emailFailed
    ? "Payment successful! Email delivery failed. Use OTP shown below."
    : "Payment successful! Check your email for OTP.",
  email: user.email,
  userId: user._id.toString(),
devOtp: process.env.NODE_ENV === "development" ? otp : undefined,});
    } catch (error) {
      logger.error({ err: error }, "Payment verification error");
      return res.status(500).json({ error: error.message || "Payment verification failed." });
    }
  }
);

/* =========================
   OLD SIGNUP (KEPT FOR COMPATIBILITY)
   🚨 NOTE: NEW SIGNUPS SHOULD USE /create-order + /verify-payment
========================= */
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
      const password = req.body.password;

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

    if (process.env.REQUIRE_PAYMENT_FOR_SIGNUP !== "false") {
      return res.status(402).json({ error: "Activation payment is required. Please complete payment signup." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
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
    logger.error({ err: error }, "Signup error");
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
      user.otpAttemptCount = (user.otpAttemptCount || 0) + 1;
      if (user.otpAttemptCount >= 5) {
        user.otp = undefined;
        user.otpExpiry = undefined;
        await user.save();
        return res.status(429).json({ error: "Too many invalid OTP attempts. Please request a new code." });
      }
      await user.save();
      return res.status(400).json({ error: "Invalid OTP code." });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpAttemptCount = 0;
    await user.save();

    const token = generateToken(user);
    await incrementAnalytics(user._id, { loginCount: 1, sessionCount: 1 });
    return res.json({
      success: true,
      message: "Account verified successfully.",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    logger.error({ err: error }, "Verify error");
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
    user.otpAttemptCount = 0;
    await user.save();
    await sendOtpEmail(email, otp);

    return res.json({
      message: "A new OTP has been sent.",
      devOtp: process.env.NODE_ENV === "production" ? undefined : otp,
    });
  } catch (error) {
    logger.error({ err: error }, "Resend OTP error");
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
      const password = req.body.password;

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

    // Payment is only required for new signup / account creation.
    // Existing verified users may login normally without a payment gate.
    const token = generateToken(user);
    await incrementAnalytics(user._id, { loginCount: 1, sessionCount: 1 });

    return res.json({
      success: true,
      token,
      user: publicUser(user),
    });
  } catch (error) {
    logger.error({ err: error }, "Login error");
    return res.status(500).json({ error: "Login failed." });
  }
});

module.exports = router;
