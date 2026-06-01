const fs = require("fs");
const path = require("path");

const ASSET_VERSION = process.env.ASSET_VERSION || "1.0.0";
const ASSET_VERSION_TOKEN = "__ASSET_VERSION__";

const htmlNoCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

function applyAssetVersion(html) {
  return html.replace(new RegExp(ASSET_VERSION_TOKEN, "g"), ASSET_VERSION);
}

function sendVersionedHtml({ res, publicDir, fileName, logger }) {
  res.set(htmlNoCacheHeaders);
  fs.readFile(path.join(publicDir, fileName), "utf8", (error, html) => {
    if (error) {
      logger.error({ err: error, fileName }, "Failed to read HTML file");
      return res.status(500).send("Unable to load page");
    }

    return res.type("html").send(applyAssetVersion(html));
  });
}

function setStaticCacheHeaders(res, filePath) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (filePath.endsWith(".html")) {
    Object.entries(htmlNoCacheHeaders).forEach(([header, value]) => {
      res.setHeader(header, value);
    });
    return;
  }

  if (filePath.endsWith(".css") || filePath.endsWith(".js")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=86400");
}

module.exports = {
  ASSET_VERSION,
  ASSET_VERSION_TOKEN,
  htmlNoCacheHeaders,
  applyAssetVersion,
  sendVersionedHtml,
  setStaticCacheHeaders,
};
