require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const crypto = require("crypto");

const connectDB = require("./config/db");
const chatRoutes = require("./routes/chat");
const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");
const supportRoutes = require("./routes/support");
const adminRoutes = require("./routes/admin");
const analyticsRoutes = require("./routes/analytics");
const logger = require("./utils/logger");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

logger.info("Attempting to connect to MongoDB...");
connectDB()
  .then(() => {
    app.get("/aura-control-center", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "admin.html"));
    });

    app.get("/aura-control-center/*", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "admin.html"));
    });

    app.get("/admin.html", (req, res) => {
      res.redirect("/aura-control-center");
    });

    app.use(express.static(path.join(__dirname, "public"), {
      etag: true,
      maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }));
    app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
      index: false,
      dotfiles: "deny",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "private, max-age=300");
      },
    }));

    app.use("/api/chat", chatRoutes);
    app.use("/api/auth", authRoutes);
    app.use("/api/upload", uploadRoutes);
    app.use("/api/support", supportRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/analytics", analyticsRoutes);

    app.get("/api/health", (req, res) => {
      res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    app.get("/api/test", (req, res) => {
      res.json({ message: "Server working" });
    });

    app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "auth.html"));
    });

    app.get(["/login.html", "/signup.html", "/verify.html", "/index.html"], (req, res) => {
      res.redirect("/auth.html");
    });

    app.use(notFoundHandler);
    app.use(errorHandler);

    const server =app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

    const shutdown = (signal) => {
      logger.info({ signal }, "Graceful shutdown requested");
      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((error) => {
    logger.error({ err: error }, "MongoDB connection failed, shutting down");
    process.exit(1);
  });
