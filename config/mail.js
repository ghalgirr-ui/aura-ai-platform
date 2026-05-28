const SibApiV3Sdk = require("sib-api-v3-sdk");

const defaultClient = SibApiV3Sdk.ApiClient.instance;

const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const sendEmail = async (to, subject, htmlContent) => {
  return apiInstance.sendTransacEmail({
    sender: {
      name: "Aura",
      email: "ghalgirr@gmail.com",
    },
    to: [{ email: to }],
    subject,
    htmlContent,
  });
};

module.exports = sendEmail;