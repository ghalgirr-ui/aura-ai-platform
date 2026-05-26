// Analytics Tracking System
window.Aura.Analytics = {
  // Track analytics events
  trackEvent: async function (eventType) {
    try {
      const token = window.Aura.getToken();
      if (!token) return;

      // Batch events to reduce API calls
      if (!window.Aura.Analytics.eventQueue) {
        window.Aura.Analytics.eventQueue = [];
        // Send batch every 30 seconds
        setInterval(() => window.Aura.Analytics.flushEvents(), 30000);
      }

      window.Aura.Analytics.eventQueue.push({
        event: eventType,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Analytics tracking error:", error);
    }
  },

  flushEvents: async function () {
    if (!window.Aura.Analytics.eventQueue || window.Aura.Analytics.eventQueue.length === 0) {
      return;
    }

    const events = window.Aura.Analytics.eventQueue.splice(0);

    try {
      const token = window.Aura.getToken();
      if (!token) return;

      // Map events to analytics updates
      const updates = {
        messagesSent: 0,
        aiResponses: 0,
        webSearchCount: 0,
        voiceCount: 0,
        uploadCount: 0,
        memoryCount: 0,
        supportSubmissions: 0,
      };

      events.forEach((e) => {
        if (e.event === "message_sent") updates.messagesSent++;
        else if (e.event === "ai_response") updates.aiResponses++;
        else if (e.event === "web_search") updates.webSearchCount++;
        else if (e.event === "voice_input") updates.voiceCount++;
        else if (e.event === "file_upload") updates.uploadCount++;
        else if (e.event === "memory_saved") updates.memoryCount++;
        else if (e.event === "support_submission") updates.supportSubmissions++;
      });

      // Only send if there are actual updates
      const hasUpdates = Object.values(updates).some((v) => v > 0);
      if (!hasUpdates) return;

      const mode = document.getElementById("modeSelect")?.value || "general";
      const model = document.getElementById("modelSelect")?.value || "aura";
      const response = await fetch("/api/analytics/track", {
        method: "POST",
        headers: window.Aura.getAuthHeaders(),
        body: JSON.stringify({ counters: updates, mode, model }),
      });

      if (!response.ok) {
        window.Aura.Analytics.eventQueue.unshift(...events.slice(0, 50));
      }
    } catch (error) {
      console.error("Failed to flush events:", error);
    }
  },

  // Track message sent
  trackMessageSent: function () {
    window.Aura.Analytics.trackEvent("message_sent");
  },

  // Track AI response received
  trackAIResponse: function () {
    window.Aura.Analytics.trackEvent("ai_response");
  },

  // Track web search usage
  trackWebSearch: function () {
    window.Aura.Analytics.trackEvent("web_search");
  },

  // Track voice input
  trackVoiceInput: function () {
    window.Aura.Analytics.trackEvent("voice_input");
  },

  // Track file upload
  trackFileUpload: function () {
    window.Aura.Analytics.trackEvent("file_upload");
  },

  // Track memory usage
  trackMemorySaved: function () {
    window.Aura.Analytics.trackEvent("memory_saved");
  },

  // Track session time
  startSessionTimer: function () {
    if (!window.Aura.Analytics.sessionStart) {
      window.Aura.Analytics.sessionStart = Date.now();
    }
    window.Aura.Analytics.trackEvent("session_start");
  },

  getSessionDuration: function () {
    if (!window.Aura.Analytics.sessionStart) return 0;
    return Math.round((Date.now() - window.Aura.Analytics.sessionStart) / 1000); // seconds
  },
};

// Initialize analytics
if (window.Aura) {
  window.Aura.Analytics.startSessionTimer();
  window.addEventListener("beforeunload", () => {
    const duration = window.Aura.Analytics.getSessionDuration();
    const token = window.Aura.getToken?.();
    if (token) {
      fetch("/api/analytics/session-end", {
        method: "POST",
        headers: window.Aura.getAuthHeaders(),
        body: JSON.stringify({ duration }),
        keepalive: true,
      }).catch(() => {});
    }
  });
}
