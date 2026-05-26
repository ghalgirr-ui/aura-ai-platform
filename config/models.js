// Multi-Model Configuration
// Maps model IDs to OpenRouter/Gemini model identifiers

const models = {
  // Original models preserved
  aura: {
    id: "aura",
    name: "Aura",
    subtitle: "Aura (Llama 3.1 8B)",
    provider: "openrouter",
    model: "meta-llama/llama-3.1-8b-instruct",
    description: "Fast, lightweight, great for quick responses",
  },
  
  auraplus: {
    id: "auraplus",
    name: "AuraPlus",
    subtitle: "Aura Plus (Gemini 2.5 flash)",
    provider: "gemini",
    model: "gemini-2.5-flash",
    description: "Premium Gemini model with strong multimodal and reasoning capabilities",
  },

  aurafast: {
    id: "aurafast",
    name: "Aura Fast",
    subtitle: "Aura Fast (Mistral 7B Instruct)",
    provider: "openrouter",
    model: "mistralai/mistral-7b-instruct",
    description: "Low-latency model tuned for fast responses",
  },

  aurasmall: {
    id: "aurasmall",
    name: "Aura Small",
    subtitle: "Aura Small (Gemini 2.5 flash)",
    provider: "gemini",
    model: "gemini-2.5-flash",
    description: "Lightweight Gemini model for cost-effective responses",
  },

  auradeep: {
    id: "auradeep",
    name: "Aura Deep",
    subtitle: "Aura Deep (DeepSeek)",
    provider: "openrouter",
    model: "deepseek/deepseek-chat",
    description: "Specialized for in-depth analysis and reasoning",
  },

  auraresearch: {
    id: "auraresearch",
    name: "Aura Research",
    subtitle: "Aura Research (Perplexity Sonar Pro)",
    provider: "openrouter",
    model: "perplexity/sonar-pro",
    description: "Research-optimized model for web-integrated queries",
  },

  auraclaude: {
    id: "auraclaude",
    name: "Aura Claude",
    subtitle: "Aura Claude (Claude 3.5 Sonnet)",
    provider: "openrouter",
    model: "anthropic/claude-3.5-sonnet",
    description: "Advanced reasoning and nuanced responses",
  },

  auragpt: {
    id: "auragpt",
    name: "Aura GPT",
    subtitle: "Aura GPT (GPT-4o)",
    provider: "openrouter",
    model: "openai/gpt-4o",
    description: "Industry-leading OpenAI model",
  },
};

/**
 * Get model configuration by ID
 * @param {string} modelId - The model identifier
 * @returns {object} Model configuration object
 */
function getModel(modelId) {
  return models[modelId] || models.aura; // Default to Aura if not found
}

/**
 * Get all available models
 * @returns {object} All available models
 */
function getAllModels() {
  return models;
}

/**
 * Get models by provider
 * @param {string} provider - Provider name (openrouter, gemini)
 * @returns {object} Models for that provider
 */
function getModelsByProvider(provider) {
  const result = {};
  for (const [id, config] of Object.entries(models)) {
    if (config.provider === provider) {
      result[id] = config;
    }
  }
  return result;
}

module.exports = {
  models,
  getModel,
  getAllModels,
  getModelsByProvider,
};
