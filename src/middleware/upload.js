const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const ApiError = require("../utils/ApiError");
const files = require("../utils/files");

const TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

// The file name is made by us (random), never taken from the user
const storage = multer.diskStorage({
  destination(req, file, cb) {
    files.ensureUploadFolder();
    cb(null, files.folder());
  },
  filename(req, file, cb) {
    cb(null, `${crypto.randomBytes(12).toString("hex")}${TYPES[file.mimetype]}`);
  },
});

const uploader = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: MAX_FILES },
  fileFilter(req, file, cb) {
    if (!TYPES[file.mimetype]) return cb(ApiError.badRequest("Only JPG, PNG and WEBP images are allowed", [{ field: file.fieldname, message: file.mimetype }]));
    cb(null, true);
  },
});

// The first bytes of a real image are fixed. This catches files that only pretend to be images.
function looksLikeImage(file) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(file.path, "r");
  try {
    fs.readSync(fd, buf, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (file.mimetype === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (file.mimetype === "image/png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === "image/webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  return false;
}

// Use after multer. If anything is wrong, every saved file is deleted.
async function checkImages(req, res, next) {
  const list = req.files || [];
  if (!list.length) return next(ApiError.badRequest("Send at least one image in the form field named 'images'"));
  const bad = list.filter((f) => !looksLikeImage(f));
  if (bad.length) {
    await files.deleteFiles(list);
    return next(ApiError.badRequest("A file is not a real image", bad.map((f) => ({ field: "images", message: f.originalname }))));
  }
  next();
}

module.exports = { uploadImages: uploader.array("images", MAX_FILES), checkImages, MAX_FILES, MAX_BYTES };
