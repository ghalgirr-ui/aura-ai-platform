// Web Search Service - Tavily API Integration

const axios = require("axios");
const logger = require("../utils/logger");

const TAVILY_API_URL = "https://api.tavily.com/search";

/**
 * Perform a web search using Tavily API
 * @param {string} query - The search query
 * @param {object} options - Search options
 * @returns {Promise<object>} Search results
 */
async function performWebSearch(query, options = {}) {
  if (!process.env.TAVILY_API_KEY) {
    logger.warn("TAVILY_API_KEY not configured. Web search unavailable.");
    return {
      success: false,
      error: "Web search is not configured",
      results: [],
    };
  }

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return {
      success: false,
      error: "Query is required and must be a non-empty string",
      results: [],
    };
  }

  try {
    const response = await axios.post(
      TAVILY_API_URL,
      {
        api_key: process.env.TAVILY_API_KEY,
        query: query.trim(),
        include_answer: true,
        max_results: options.maxResults || 5,
        search_depth: options.searchDepth || "basic",
        topic: options.topic || "general",
        include_domains: options.includeDomains || [],
        exclude_domains: options.excludeDomains || [],
      },
      { timeout: Number(process.env.SEARCH_TIMEOUT_MS || 12000) }
    );

    if (response.data && response.data.results) {
      return {
        success: true,
        query: query,
        answer: response.data.answer || null,
        results: response.data.results.map((result) => ({
          title: result.title,
          url: result.url,
          content: result.content,
          source: result.source || new URL(result.url).hostname,
        })),
      };
    }

    return {
      success: false,
      error: "No results found",
      results: [],
    };
  } catch (error) {
    logger.error({ err: error }, "Web search error");

    // Differentiate between API errors and network errors
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || "API error";

      if (status === 401) {
        return {
          success: false,
          error: "Invalid API key for web search",
          results: [],
        };
      } else if (status === 429) {
        return {
          success: false,
          error: "Web search rate limit exceeded. Try again later.",
          results: [],
        };
      }

      return {
        success: false,
        error: `Web search API error: ${message}`,
        results: [],
      };
    }

    return {
      success: false,
      error: "Network error performing web search",
      results: [],
    };
  }
}

/**
 * Format search results for injection into AI prompt
 * @param {object} searchResult - Result from performWebSearch
 * @returns {string} Formatted search context
 */
function formatSearchContext(searchResult) {
  if (!searchResult.success || searchResult.results.length === 0) {
    return "";
  }

  let context = "📰 **Latest Search Results:**\n\n";

  if (searchResult.answer) {
    context += `**Quick Answer:** ${searchResult.answer}\n\n`;
  }

  searchResult.results.forEach((result, index) => {
    context += `**${index + 1}. ${result.title}**\n`;
    context += `   Source: ${result.source}\n`;
    context += `   ${result.content}\n\n`;
  });

  return context;
}

/**
 * Check if a query should trigger web search
 * Detects queries about current events, recent information, etc.
 * @param {string} query - The user query
 * @returns {boolean} Whether web search is recommended
 */
function shouldTriggerWebSearch(query) {
  if (!query) return false;

  const webSearchIndicators = [
    // Temporal keywords
    /\b(today|tonight|this (morning|afternoon|evening|week|month|year)|latest|recent|current|breaking|news)\b/i,
    // Time-sensitive topics
    /\b(stock price|weather|score|game result|trending|viral|rate|price of)\b/i,
    // Current events
    /\b(what is happening|latest updates|current status)\b/i,
    // News-related
    /\b(news|headlines|events|announcement)\b/i,
  ];

  return webSearchIndicators.some((indicator) => indicator.test(query));
}

module.exports = {
  performWebSearch,
  formatSearchContext,
  shouldTriggerWebSearch,
};
