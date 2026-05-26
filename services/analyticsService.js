const UserAnalytics = require("../models/UserAnalytics");

const ALLOWED_COUNTERS = new Set([
  "loginCount",
  "sessionCount",
  "dashboardOpens",
  "totalTimeSpent",
  "messagesSent",
  "aiResponses",
  "webSearchCount",
  "voiceCount",
  "uploadCount",
  "memoryWrites",
  "memoryReads",
  "supportSubmissions",
]);

const MODE_FIELDS = {
  general: "modeUsage.general",
  coding: "modeUsage.coding",
  research: "modeUsage.research",
  writing: "modeUsage.writing",
  study: "modeUsage.study",
  startup: "modeUsage.startup",
};

const incrementAnalytics = async (userId, counters = {}, meta = {}) => {
  if (!userId) return null;

  const inc = {};
  Object.entries(counters).forEach(([key, value]) => {
    const count = Number(value);
    if (ALLOWED_COUNTERS.has(key) && Number.isFinite(count) && count > 0) {
      inc[key] = Math.min(Math.trunc(count), 1000);
    }
  });

  if (meta.mode && MODE_FIELDS[meta.mode]) {
    inc[MODE_FIELDS[meta.mode]] = (inc[MODE_FIELDS[meta.mode]] || 0) + 1;
  }

  if (meta.model) {
    const modelKey = String(meta.model).replace(/[.$]/g, "_").slice(0, 64);
    inc[`modelUsage.${modelKey}`] = (inc[`modelUsage.${modelKey}`] || 0) + 1;
  }

  const update = {
    $set: { lastSeen: new Date() },
  };
  if (Object.keys(inc).length) update.$inc = inc;

  return UserAnalytics.findOneAndUpdate({ userId }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
};

module.exports = { incrementAnalytics };
