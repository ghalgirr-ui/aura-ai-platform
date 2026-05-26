const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadsRoot = path.join(__dirname, "../uploads");
fs.mkdirSync(uploadsRoot, { recursive: true });

const extensionByMime = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

const blockedExtensions = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".js",
  ".mjs",
  ".html",
  ".htm",
  ".svg",
  ".php",
  ".jar",
  ".msi",
]);

const hasUnsafeName = (name = "") => {
  const normalized = String(name).replace(/\\/g, "/");
  return normalized.includes("/") || normalized.includes("..") || /[\x00-\x1f]/.test(normalized);
};

const createUploader = (allowedMimeTypes, subfolder, maxFileSize = 10 * 1024 * 1024) => {
  const destination = path.join(uploadsRoot, subfolder);
  const resolvedDestination = path.resolve(destination);
  if (!resolvedDestination.startsWith(path.resolve(uploadsRoot))) {
    throw new Error("Invalid upload destination");
  }
  fs.mkdirSync(destination, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destination),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, safeName);
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowedExts = extensionByMime[file.mimetype] || [];

    if (
      !hasUnsafeName(file.originalname) &&
      !blockedExtensions.has(ext) &&
      allowedMimeTypes.includes(file.mimetype) &&
      allowedExts.includes(ext)
    ) {
      return cb(null, true);
    }

    cb(new Error("Unsupported file type"));
  };

  return multer({
    storage,
    limits: { fileSize: maxFileSize, files: 1 },
    fileFilter,
  }).single("file");
};

const imageUpload = createUploader(
  ["image/png", "image/jpeg", "image/webp"],
  "images",
  8 * 1024 * 1024
);

const pdfUpload = createUploader(["application/pdf"], "pdfs", 10 * 1024 * 1024);

const verifyMagicBytes = async (filePath, expectedType) => {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(16);
    await handle.read(buffer, 0, 16, 0);
    if (expectedType === "pdf") return buffer.subarray(0, 4).toString() === "%PDF";
    if (expectedType === "image") {
      const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const jpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const webp = buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
      return png || jpg || webp;
    }
    return false;
  } finally {
    await handle.close();
  }
};

module.exports = { imageUpload, pdfUpload, verifyMagicBytes };
