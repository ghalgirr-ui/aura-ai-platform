require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const connectDB = require("./config/db");
const chatRoutes = require("./routes/chat");
const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");

const app = express();

console.log("Attempting to connect to MongoDB...");
connectDB()
  .then(() => {
    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, "public")));
    app.use("/uploads", express.static(path.join(__dirname, "uploads")));

    app.use("/api/chat", chatRoutes);
    app.use("/api/auth", authRoutes);
    app.use("/api/upload", uploadRoutes);

    app.get("/api/test", (req, res) => {
      res.json({ message: "Server working" });
    });

    app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "auth.html"));
    });

    app.get(["/login.html", "/signup.html", "/verify.html", "/index.html"], (req, res) => {
      res.redirect("/auth.html");
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed, shutting down:", error.message);
    process.exit(1);
  });
