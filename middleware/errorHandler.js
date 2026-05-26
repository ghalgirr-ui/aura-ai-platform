const multer = require("multer");
const mongoose = require("mongoose");
const logger = require("../utils/logger");

class AppError extends Error {
  constructor(message, statusCode = 500, code = "APP_ERROR", details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, "NOT_FOUND"));
};

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  let statusCode = error.statusCode || 500;
  let code = error.code || "INTERNAL_ERROR";
  let message = error.message || "Unexpected server error";
  let details = error.details;

  if (error instanceof multer.MulterError) {
    statusCode = 400;
    code = error.code || "UPLOAD_ERROR";
    message = error.code === "LIMIT_FILE_SIZE" ? "Uploaded file is too large." : "File upload error.";
  } else if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Validation failed.";
    details = Object.values(error.errors).map((item) => item.message);
  } else if (error instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = "INVALID_ID";
    message = "Invalid identifier.";
  } else if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    statusCode = 401;
    code = "AUTH_ERROR";
    message = "Invalid or expired token.";
  } else if (error.code === 11000) {
    statusCode = 409;
    code = "DUPLICATE_RECORD";
    message = "A record with this value already exists.";
  }

  const requestId = req.id || req.headers["x-request-id"];
  const logPayload = {
    err: error,
    requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code,
  };

  if (statusCode >= 500) logger.error(logPayload, message);
  else logger.warn(logPayload, message);

  res.status(statusCode).json({
    success: false,
    error: message,
    code,
    requestId,
    ...(details ? { details } : {}),
  });
};

module.exports = { AppError, notFoundHandler, errorHandler };
