const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadsRoot = path.join(__dirname, "../uploads");
fs.mkdirSync(uploadsRoot, { recursive: true });

const createUploader = (allowedMimeTypes, subfolder) => {
  const destination = path.join(uploadsRoot, subfolder);
  fs.mkdirSync(destination, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destination),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, safeName);
    },
  });

  const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      return cb(null, true);
    }

    cb(new Error("Unsupported file type"));
  };

  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter,
  }).single("file");
};

const imageUpload = createUploader(
  ["image/png", "image/jpeg", "image/jpg", "image/webp"],
  "images"
);

const pdfUpload = createUploader(["application/pdf"], "pdfs");

module.exports = { imageUpload, pdfUpload };
