require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const fs = require("fs");
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
const { htmlNoCacheHeaders, sendVersionedHtml, setStaticCacheHeaders } = require("./config/assets");

const app = express();
const PORT = process.env.PORT || 5000;
const PUBLIC_DIR = path.join(__dirname, "public");

function sendHtml(res, fileName) {
  sendVersionedHtml({ res, publicDir: PUBLIC_DIR, fileName, logger });
}

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
      sendHtml(res, "admin.html");
    });

    app.get("/aura-control-center/*", (req, res) => {
      sendHtml(res, "admin.html");
    });

    app.get("/admin.html", (req, res) => {
      res.set(htmlNoCacheHeaders);
      res.redirect("/aura-control-center");
    });

    app.get("/", (req, res) => {
      sendHtml(res, "auth.html");
    });

    app.get("/auth.html", (req, res) => {
      sendHtml(res, "auth.html");
    });

    app.get("/dashboard.html", (req, res) => {
      sendHtml(res, "dashboard.html");
    });

    app.get("/:page.html", (req, res, next) => {
      const fileName = `${req.params.page}.html`;
      const filePath = path.join(PUBLIC_DIR, fileName);

      if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
        return next();
      }

      fs.access(filePath, fs.constants.R_OK, (error) => {
        if (error) {
          return next();
        }

        return sendHtml(res, fileName);
      });
    });

    app.use(express.static(PUBLIC_DIR, {
      etag: true,
      maxAge: 0,
      setHeaders: setStaticCacheHeaders,
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

    app.get(["/login.html", "/signup.html", "/verify.html", "/index.html"], (req, res) => {
      res.set(htmlNoCacheHeaders);
      res.redirect("/auth.html");
    });

    app.use(notFoundHandler);
    app.use(errorHandler);

    const server = app.listen(PORT, () => {
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
