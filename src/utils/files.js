const fs = require("fs");
const path = require("path");
const env = require("../config/env");

// Images from uploads are saved here and shown at /uploads/properties/<name>
const PUBLIC_PREFIX = "/uploads/properties/";
const folder = () => path.join(env.uploadDir, "properties");

const ensureUploadFolder = () => fs.mkdirSync(folder(), { recursive: true });

const isLocalImage = (url) => typeof url === "string" && url.startsWith(PUBLIC_PREFIX) && /^[A-Za-z0-9._-]+$/.test(url.slice(PUBLIC_PREFIX.length));
const publicUrl = (filename) => PUBLIC_PREFIX + filename;

// Deletes files from disk. Only names that match our own pattern are touched, so nothing outside the folder can be deleted.
async function deleteLocalImages(urls = []) {
  await Promise.all(
    urls.filter(isLocalImage).map((u) => fs.promises.unlink(path.join(folder(), u.slice(PUBLIC_PREFIX.length))).catch(() => {}))
  );
}
const deleteFiles = (files = []) => Promise.all(files.map((f) => fs.promises.unlink(f.path).catch(() => {})));

module.exports = { folder, ensureUploadFolder, isLocalImage, publicUrl, deleteLocalImages, deleteFiles };
