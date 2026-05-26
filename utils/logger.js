const pino = require("pino");

const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "authorization",
      "password",
      "otp",
      "token",
      "razorpay_signature",
      "RAZORPAY_KEY_SECRET",
      "JWT_SECRET",
      "OPENROUTER_API_KEY",
      "GEMINI_API_KEY",
      "TAVILY_API_KEY",
    ],
    censor: "[redacted]",
  },
  transport: undefined,
});

module.exports = logger;
