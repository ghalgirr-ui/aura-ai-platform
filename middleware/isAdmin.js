const { protect } = require("./authMiddleware");

const isAdmin = async (req, res, next) => {
  // ensure user is authenticated first
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
};

module.exports = { isAdmin, protect };
