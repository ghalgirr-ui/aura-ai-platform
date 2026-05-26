// AI Provider Switch Handler - Enhanced with Modes, Multi-Model & Web Search

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const http = require("http");
const https = require("https");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Import configurations and services
const modes = require("./config/modes");
const { getModel } = require("./config/models");
const { performWebSearch, formatSearchContext, shouldTriggerWebSearch } = require("./services/searchService");
const logger = require("./utils/logger");

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
      logger.warn({ err: error }, "Gemini response text error");
      return null;
    }
  }
  if (typeof responseText === "string") {
    return responseText;
  }
  return null;
};

const buildMemoryContext = (memoryData) => {
  const memories = Array.isArray(memoryData)
    ? memoryData
    : [
        ...(memoryData?.globalMemories || []),
        ...(memoryData?.chatMemories || []),
      ];
  if (!memories.length) return "";
  const lines = memories.map((memory) => `- ${memory.key}: ${memory.value}`);
  return `User Memory:\n${lines.join("\n")}`;
};

// Global response-quality rules applied to all modes
const globalResponseRules = `Global Response Rules:
- Prefer concise, structured answers by default. Use headings and bullets where helpful.
- Use code blocks for any code. For coding requests, output runnable code first, then a short explanation.
- Avoid repetitive or generic AI disclaimers. Personalize using user memory only when relevant.
- When web-search / evidence context is available, integrate it and cite clearly.
- Keep responses user-focused and actionable.`;

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
      logger.debug({ attempt, modelName }, "Gemini attempt");
      return await requestFn();
    } catch (error) {
      lastError = error;
      const status = error?.status || error?.statusCode || error?.response?.status;
      const code = status || error?.message || "unknown";
      const retryable = isRetryableGeminiError(error);

      if (attempt < delays.length && retryable) {
        logger.warn({ attempt, code, modelName, delay: delays[attempt] }, "Gemini attempt failed, retrying");
        await sleep(delays[attempt]);
        continue;
      }

      logger.error({ err: error, attempt, code, modelName }, "Gemini attempt failed");
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
    logger.warn({ primaryModel, fallbackModel }, "Gemini primary model failed, falling back");

    try {
      return await retryGeminiRequest(() => executeRequest(fallbackModel), fallbackModel);
    } catch (fallbackError) {
      const retryable = isRetryableGeminiError(fallbackError);
      logger.error({ err: fallbackError, fallbackModel }, "Gemini fallback model failed");
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
    logger.error({ err: error }, "Gemini image analysis error");
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
    logger.error({ err: error }, "Gemini document analysis error");
    return "⚠️ Gemini is busy right now. Please try again in a moment.";
  }
};

const streamGeminiModel = async (modelName, prompt, res, isAborted) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContentStream(prompt);

  let fullText = "";
  for await (const chunk of result.stream) {
    if (isAborted()) break;
    const token = chunk?.text?.();
    if (token) {
      fullText += token;
      if (!isAborted() && !res.writableEnded) res.write(token);
    }
  }
  return fullText;
};

const streamOpenRouterResponse = async (modelConfig, messagesWithMode, finalMessage, res, options, isAborted) => {
  const openrouterModel = modelConfig?.model || "meta-llama/llama-3-8b-instruct";
  const buildStream = async (modelName, allowKeepAlive = false) => {
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const isHttps = url.startsWith("https:");
    const agentOptions = { keepAlive: !!allowKeepAlive };
    const axiosOptions = {
      method: "post",
      url,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      data: {
        model: modelName,
        messages: [...messagesWithMode, { role: "user", content: finalMessage }],
        stream: true,
      },
      responseType: "stream",
      timeout: Number(process.env.AI_TIMEOUT_MS || 60000),
    };

    // Explicitly avoid long-lived keep-alive by default (can be toggled by flag)
    if (isHttps) axiosOptions.httpsAgent = new https.Agent(agentOptions);
    else axiosOptions.httpAgent = new http.Agent(agentOptions);

    const response = await axios(axiosOptions);

    let fullText = "";
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(fullText);
      };

      if (typeof res.once === "function") {
        res.once("close", () => {
          try {
            if (response.data?.destroy) response.data.destroy();
          } catch (e) {}
          finish();
        });
      }

      response.data.on("data", (chunk) => {
        try {
          if (isAborted()) {
            if (response.data?.destroy) response.data.destroy();
            finish();
            return;
          }
          const lines = chunk.toString().split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const json = JSON.parse(line.replace("data: ", ""));
                const token = json.choices?.[0]?.delta?.content;
                if (token) {
                  fullText += token;
                  if (!isAborted() && !res.writableEnded) res.write(token);
                }
              } catch (parseErr) {
                // ignore parse errors for partial lines
              }
            }
          }
        } catch (e) {
          logger.error({ err: e }, "Error processing OpenRouter stream chunk");
        }
      });

      response.data.on("end", finish);
      response.data.on("error", (err) => {
        logger.error({ err }, "OpenRouter Stream Error");
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });
  };

  // Helper: determine transient network errors that merit a retry
  const isTransientOpenRouterError = (err) => {
    if (!err) return false;
    const code = err.code || (err?.response && String(err.response.status));
    const msg = String(err.message || "").toLowerCase();
    if (["ecoff", "ecancelled"].includes(code)) return true;
    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNABORTED") return true;
    if (/socket hang up/i.test(msg)) return true;
    if (code === "429" || code === "503") return true;
    return false;
  };

  // Try streaming with retries and fallback to non-stream if repeated failures occur
  const tryStreamWithRetries = async (modelName) => {
    const maxAttempts = 3; // initial + 2 retries
    const delays = [0, 1500, 3500];
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        logger.debug({ attempt, modelName }, "OpenRouter streaming attempt");
        // Always disable keepAlive on initial attempts to avoid stale socket issues
        return await buildStream(modelName, false);
      } catch (err) {
        lastErr = err;
        const transient = isTransientOpenRouterError(err);
        logger.warn({ attempt, transient, err }, "OpenRouter stream attempt failed");
        if (attempt < maxAttempts && transient) {
          await sleep(delays[attempt]);
          continue;
        }

        // If non-transient or out of retries, break to fallback
        break;
      }
    }

    throw lastErr;
  };

  try {
    logger.debug({ model: openrouterModel, mode: options.mode || "general" }, "Using OpenRouter model");
    return await tryStreamWithRetries(openrouterModel);
  } catch (err) {
    logger.error({ err, model: openrouterModel }, "OpenRouter streaming failed after retries");

    // Try fallback model stream if configured
    const fallbackConfig = getModel("aura");
    const fallbackModel = fallbackConfig?.model;
    if (fallbackModel && fallbackModel !== openrouterModel) {
      try {
        logger.warn({ fallbackModel }, "OpenRouter fallback model streaming attempt");
        return await tryStreamWithRetries(fallbackModel);
      } catch (fallbackErr) {
        logger.error({ err: fallbackErr, fallbackModel }, "OpenRouter fallback streaming failed");
      }
    }

    // As a graceful fallback: attempt a non-streaming completion request (safe, single response)
    try {
      logger.warn({}, "Falling back to non-stream OpenRouter request");
      const nonStreamResp = await axios({
        method: "post",
        url: "https://openrouter.ai/api/v1/chat/completions",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        data: {
          model: openrouterModel,
          messages: [...messagesWithMode, { role: "user", content: finalMessage }],
          stream: false,
        },
        responseType: "json",
        timeout: Number(process.env.AI_TIMEOUT_MS || 60000),
        httpsAgent: new https.Agent({ keepAlive: false }),
      });

      // Try common response shapes
      const body = nonStreamResp?.data;
      const text =
        body?.choices?.[0]?.message?.content ||
        body?.choices?.[0]?.text ||
        body?.output?.[0]?.content ||
        (typeof body === "string" ? body : null);

      if (text) return text;
    } catch (nonStreamErr) {
      logger.error({ err: nonStreamErr }, "OpenRouter non-stream fallback failed");
    }
    // If non-stream OpenRouter also failed, attempt Gemini fallback (best-effort)
    try {
      logger.warn({}, "Attempting Gemini fallback for failed OpenRouter request");
      const historyText = messagesWithMode
        .map((m) => `${m.role === "system" ? "System" : m.role === "user" ? "User" : "AI"}: ${m.content}`)
        .join("\n");
      const prompt = `${historyText}\nUser: ${finalMessage}\nAI:`;
      const geminiResult = await retryGeminiRequest(() => streamGeminiModel(modelConfig?.model || "gemini-2.5-flash", prompt, res, isAborted), modelConfig?.model || "gemini-2.5-flash");
      return typeof geminiResult === "string" ? geminiResult : parseGeminiResponse(geminiResult) || "⚠️ AI service is busy. Please try again shortly.";
    } catch (gemErr) {
      logger.error({ err: gemErr }, "Gemini fallback failed after OpenRouter failures");
      // Final graceful message to return to frontend (avoid generic raw errors)
      return "⚠️ AI service temporarily unavailable. Please try again in a moment or switch providers.";
    }
  }
};

async function handleAI(provider, chat, message, res, options = {}) {
  const isAborted = typeof options.isAborted === "function" ? options.isAborted : () => false;
  const selectedMode = options.mode || "general";
  const enableWebSearch = options.webSearch === true;

  // ✅ Handle model-based routing (Feature 2: Multi-Model Support)
  let modelConfig = null;
  if (options.model) {
    modelConfig = getModel(options.model);
    provider = modelConfig.provider;
  } else if (provider === "openrouter") {
    modelConfig = getModel("aura"); // Default Aura model
  } else if (provider === "gemini") {
    modelConfig = getModel("auraplus"); // Default AuraPlus model
  }

  // ✅ Default provider
  if (!provider) provider = "openrouter";

  // ✅ Get the mode's system prompt (Feature 1: AI Modes)
  const modeConfig = modes[selectedMode] || modes.general;
  const memoryContext = buildMemoryContext(options.userMemory);
  const basePrompt = `${globalResponseRules}

${modeConfig.systemPrompt}`;

  const systemPrompt = memoryContext
    ? `${basePrompt}

IMPORTANT PERSONAL MEMORY:
${memoryContext}

Use this saved user memory naturally when relevant. Do NOT force unrelated memory into responses.`
    : basePrompt;

  // ✅ Build messages with system prompt
  const messagesWithMode = [
    { role: "system", content: systemPrompt },
    ...chat.messages,
  ];

  // ✅ Handle web search (Feature 3: Web Search Mode)
  let searchContext = "";
if (enableWebSearch) {
  logger.debug({ queryLength: message.length }, "Web search enabled");

  try {
    const searchResult = await performWebSearch(message, {
      maxResults: 5,
      topic: "news",
      searchDepth: "advanced",
    });

    if (searchResult.success) {
      searchContext = formatSearchContext(searchResult);
      logger.debug({ resultCount: searchResult.results.length }, "Web search returned results");
    } else {
      logger.warn({ error: searchResult.error }, "Web search failed");
    }

  } catch (err) {
    logger.error({ err }, "Web search error");
  }
}

  // ✅ Inject search context into the message if available
  let finalMessage = message;
  if (searchContext) {
    finalMessage = `${searchContext}\n\nBased on the search results above, please answer this user query:\n${message}`;
  }

  /* =========================
     🟣 GEMINI PROVIDER
  ========================= */
  if (provider === "gemini") {
    const historyText = messagesWithMode
      .map((m) => `${m.role === "system" ? "System" : m.role === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n");

    const prompt = `${historyText}\nUser: ${finalMessage}\nAI:`;
    try {
      return await retryGeminiRequest(
        () => streamGeminiModel(modelConfig?.model || "gemini-2.5-flash", prompt, res, isAborted),
        modelConfig?.model || "gemini-2.5-flash"
      );
    } catch (primaryError) {
      logger.warn({ err: primaryError }, "Gemini primary model failed, falling back to Gemini 1.5");
      try {
        return await retryGeminiRequest(
          () => streamGeminiModel("gemini-1.5-flash", prompt, res, isAborted),
          "gemini-1.5-flash"
        );
      } catch (fallbackError) {
        logger.error({ err: fallbackError }, "Gemini fallback model failed, switching to OpenRouter");
        return await streamOpenRouterResponse(modelConfig, messagesWithMode, finalMessage, res, options, isAborted);
      }
    }
  }

  /* =========================
     🔵 OPENROUTER PROVIDER
  ========================= */
  else {
    return await streamOpenRouterResponse(modelConfig, messagesWithMode, finalMessage, res, options, isAborted);
  }
}

module.exports = { handleAI, analyzeImageWithGemini, analyzeTextWithGemini };
