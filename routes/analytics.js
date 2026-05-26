const express = require("express");
const { body } = require("express-validator");
const { protect } = require("../middleware/authMiddleware");
const { analyticsLimiter } = require("../middleware/rateLimiter");
const { validateRequest } = require("../middleware/validateRequest");
const { incrementAnalytics } = require("../services/analyticsService");

const router = express.Router();

router.use(protect);
router.use(analyticsLimiter);

router.post(
  "/track",
  [
    body("counters").optional().isObject().withMessage("Counters must be an object."),
    body("mode").optional().isIn(["general", "coding", "research", "writing", "study", "startup"]),
    body("model").optional().isString().trim().isLength({ max: 64 }),
  ],
  validateRequest,
  async (req, res) => {
    const analytics = await incrementAnalytics(req.user._id, req.body.counters || {}, {
      mode: req.body.mode,
      model: req.body.model,
    });
    res.json({ success: true, analytics });
  }
);

router.post(
  "/session-end",
  [
    body("duration").isInt({ min: 0, max: 24 * 60 * 60 }).withMessage("Invalid session duration."),
  ],
  validateRequest,
  async (req, res) => {
    await incrementAnalytics(req.user._id, { totalTimeSpent: Number(req.body.duration) || 0 });
    res.json({ success: true });
  }
);

module.exports = router;
