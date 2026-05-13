// AI Provider Switch Handler

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const imageMimeTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const parseGeminiResponse = (response) => {
  if (!response?.response) return null;
  const responseText = response.response.text;
  if (typeof responseText === "function") {
    try {
      return responseText();
    } catch (error) {
      console.error("Gemini response text error:", error);
      return null;
    }
  }
  if (typeof responseText === "string") {
    return responseText;
  }
  return null;
};

const getImageMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return imageMimeTypes[ext] || "application/octet-stream";
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableGeminiError = (error) => {
  const status = error?.status || error?.statusCode || error?.response?.status;
  const message = String(error?.message || "").toLowerCase();
  return (
    status === 503 ||
    /service unavailable|temporary|high demand|overload|try again later/i.test(message)
  );
};

const retryGeminiRequest = async (requestFn, modelName) => {
  const delays = [0, 2000, 5000];
  let lastError;

  for (let attempt = 1; attempt <= delays.length; attempt += 1) {
    try {
      console.log(`Gemini attempt ${attempt} using ${modelName}`);
      return await requestFn();
    } catch (error) {
      lastError = error;
      const status = error?.status || error?.statusCode || error?.response?.status;
      const code = status || error?.message || "unknown";
      const retryable = isRetryableGeminiError(error);

      if (attempt < delays.length && retryable) {
        console.warn(`Gemini attempt ${attempt} failed (${code}) on model=${modelName}, retrying in ${delays[attempt]}ms...`);
        await sleep(delays[attempt]);
        continue;
      }

      console.error(`Gemini attempt ${attempt} failed (${code}) on model=${modelName}. No more retries.`);
      throw error;
    }
  }

  throw lastError;
};

const runGeminiUploadAnalysis = async (requestBuilder) => {
  const primaryModel = "gemini-2.5-flash";
  const fallbackModel = "gemini-1.5-flash";

  const executeRequest = async (modelName) => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });
    return model.generateContent(requestBuilder());
  };

  try {
    return await retryGeminiRequest(() => executeRequest(primaryModel), primaryModel);
  } catch (primaryError) {
    console.warn(`Gemini primary model ${primaryModel} failed after retries, falling back to ${fallbackModel}.`);

    try {
      return await retryGeminiRequest(() => executeRequest(fallbackModel), fallbackModel);
    } catch (fallbackError) {
      const retryable = isRetryableGeminiError(fallbackError);
      console.error(`Gemini fallback model ${fallbackModel} failed after retries.`, fallbackError);
      return retryable
        ? "⚠️ Gemini is busy right now. Please try again in a moment."
        : "⚠️ Temporary AI service overload.";
    }
  }
};

const analyzeImageWithGemini = async (imagePath, question) => {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = getImageMimeType(imagePath);

    const prompt = `Analyze this image and answer the user's question accurately. Question: ${question}`;
    const imagePayload = {
      inlineData: {
        data: base64Image,
        mimeType,
      },
    };

    const result = await runGeminiUploadAnalysis(() => [prompt, imagePayload]);
    if (typeof result === "string") return result;
    return parseGeminiResponse(result) || "⚠️ Gemini is busy right now. Please try again in a moment.";
  } catch (error) {
    console.error("Gemini image analysis error:", error);
    return "⚠️ Gemini is busy right now. Please try again in a moment.";
  }
};

const analyzeTextWithGemini = async (text, question) => {
  try {
    const prompt = `You are Aura, a helpful AI assistant. Use the document text below to answer the user question.\n\nDocument text:\n${text}\n\nQuestion: ${question}`;
    const result = await runGeminiUploadAnalysis(() => prompt);
    if (typeof result === "string") return result;
    return parseGeminiResponse(result) || "⚠️ Gemini is busy right now. Please try again in a moment.";
  } catch (error) {
    console.error("Gemini document analysis error:", error);
    return "⚠️ Gemini is busy right now. Please try again in a moment.";
  }
};

async function handleAI(provider, chat, message, res) {

  // ✅ Default provider
  if (!provider) provider = "openrouter";

  /* =========================
     🟣 GEMINI (UPDATED 2.5)
  ========================= */
  if (provider === "gemini") {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const historyText = chat.messages
        .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
        .join("\n");

      const prompt = `${historyText}\nUser: ${message}\nAI:`;
      const result = await model.generateContentStream(prompt);

      let fullText = "";
      for await (const chunk of result.stream) {
        const token = chunk.text();
        if (token) {
          fullText += token;
          res.write(token);
        }
      }

      return fullText;
    } catch (err) {
      console.error("Gemini Error:", err);
      res.write("⚠️ Gemini error");
      return "Gemini error";
    }
  }

  /* =========================
     🔵 OPENROUTER
  ========================= */
  else {
    try {
      const response = await axios({
        method: "post",
        url: "https://openrouter.ai/api/v1/chat/completions",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        data: {
          model: "meta-llama/llama-3-8b-instruct",
          messages: [...chat.messages, { role: "user", content: message }],
          stream: true,
        },
        responseType: "stream",
      });

      let fullText = "";
      return new Promise((resolve) => {
        response.data.on("data", (chunk) => {
          const lines = chunk.toString().split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const json = JSON.parse(line.replace("data: ", ""));
                const token = json.choices?.[0]?.delta?.content;
                if (token) {
                  fullText += token;
                  res.write(token);
                }
              } catch {}
            }
          }
        });

        response.data.on("end", () => resolve(fullText));
        response.data.on("error", (err) => {
          console.error("OpenRouter Stream Error:", err);
          resolve(fullText);
        });
      });
    } catch (err) {
      console.error("OpenRouter Error:", err);
      res.write("⚠️ OpenRouter error");
      return "OpenRouter error";
    }
  }
}

module.exports = { handleAI, analyzeImageWithGemini, analyzeTextWithGemini };