const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const sendEmail = require("../config/mail");

const redact = (value) => {
  const apiKey = process.env.BREVO_API_KEY;
  let safeValue = String(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
    .replace(/\b[a-f0-9]{64}\b/gi, "[redacted token]");

  if (apiKey) {
    safeValue = safeValue.split(apiKey).join("[redacted API key]");
  }

  return safeValue.slice(0, 500);
};

const getProviderError = (error) => {
  const response = error && error.response;
  const providerBody = response && response.body;
  const details = {
    errorType: error && error.name ? error.name : "Error",
    errorMessage: redact(error && error.message ? error.message : "Unknown email error"),
  };
  const httpStatus = (response && response.status) || (error && error.status);

  if (Number.isInteger(httpStatus)) {
    details.httpStatus = httpStatus;
  }
  if (error && typeof error.code === "string") {
    details.errorCode = redact(error.code);
  }
  if (providerBody && typeof providerBody === "object") {
    const safeBody = {};
    for (const key of ["code", "message", "error", "error_description"]) {
      if (typeof providerBody[key] === "string" || typeof providerBody[key] === "number") {
        safeBody[key] = redact(providerBody[key]);
      }
    }
    if (Object.keys(safeBody).length) {
      details.brevoResponse = safeBody;
    }
  }

  return details;
};

const main = async () => {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("This test can only run when NODE_ENV=development.");
  }

  const recipientArg = process.argv.slice(2).find((arg) => arg.startsWith("--to="));
  const recipient = recipientArg && recipientArg.slice("--to=".length).trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("Provide a valid test recipient with --to=address@example.com.");
  }

  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured in the app environment.");
  }
  if (!apiKey.startsWith("xkeysib-")) {
    throw new Error("BREVO_API_KEY does not have the expected Brevo API v3 key prefix (xkeysib-).");
  }

  const sender = process.env.BREVO_SENDER_EMAIL?.trim() || "ghalgirr@gmail.com";
  const result = await sendEmail(
    recipient,
    "Aura AI Brevo delivery test",
    "<p>This is a test email confirming Aura AI can submit transactional email through Brevo.</p>"
  );

  if (!result || !result.messageId) {
    throw new Error("Brevo returned no message ID; email acceptance could not be confirmed.");
  }

  console.log(JSON.stringify({
    apiHostname: "api.brevo.com",
    apiKeyFormat: "Brevo API v3 key prefix detected",
    senderConfigured: process.env.BREVO_SENDER_EMAIL ? "environment override" : "existing default",
    senderAddress: sender.replace(/^(.{2})[^@]*(@.*)$/, "$1***$2"),
    acceptedByBrevo: true,
    messageId: result.messageId,
    inboxDeliveryConfirmed: false,
  }, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({
    acceptedByBrevo: false,
    ...getProviderError(error),
  }, null, 2));
  process.exitCode = 1;
});
