const SibApiV3Sdk = require("sib-api-v3-sdk");
const dns = require("dns");
const https = require("https");
const logger = require("../utils/logger");

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const BREVO_API_BASE_URL = "https://api.brevo.com/v3";
defaultClient.basePath = BREVO_API_BASE_URL;

const ipv4FirstLookup = (hostname, options, callback) => {
  const lookupOptions = typeof options === "object" ? options : {};

  dns.lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
    if (error) {
      callback(error);
      return;
    }

    addresses.sort((left, right) => left.family - right.family);
    if (lookupOptions.all) {
      callback(null, addresses);
      return;
    }

    const address = addresses[0];
    if (!address) {
      callback(new Error(`DNS lookup returned no addresses for ${hostname}`));
      return;
    }

    callback(null, address.address, address.family);
  });
};

defaultClient.requestAgent = new https.Agent({
  lookup: ipv4FirstLookup,
  autoSelectFamily: true,
});

const apiKey = defaultClient.authentications["api-key"];
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
const DEFAULT_SENDER_EMAIL = "ghalgirr@gmail.com";

const sendEmail = async (to, subject, htmlContent) => {
  const configuredApiKey = process.env.BREVO_API_KEY?.trim();
  if (!configuredApiKey) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || DEFAULT_SENDER_EMAIL;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
    throw new Error("BREVO_SENDER_EMAIL is not a valid email address");
  }

  apiKey.apiKey = configuredApiKey;

  if (!sendEmail.hostnameLogged) {
    logger.info(
      { hostname: new URL(defaultClient.basePath).hostname },
      "Brevo API hostname configured; DNS lookup prefers IPv4 with automatic address fallback"
    );
    sendEmail.hostnameLogged = true;
  }

  return apiInstance.sendTransacEmail({
    sender: {
      name: "Aura",
      email: senderEmail,
    },
    to: [{ email: to }],
    subject,
    htmlContent,
  });
};

module.exports = sendEmail;