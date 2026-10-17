const ApiError = require("../utils/ApiError");

function notFound(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// Every error leaves the API in the same shape: { error: { code, message, details? } }
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "Each image must be 5 MB or smaller" } });
    const msg = err.code === "LIMIT_FILE_COUNT" ? "You can upload at most 5 images at a time" : err.code === "LIMIT_UNEXPECTED_FILE" ? "Use the form field name 'images' (at most 5 files)" : err.message;
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message: msg } });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
  }
  if (err.name === "ValidationError" && err.errors) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Some values are not valid", details } });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Invalid value for ${err.path}` } });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: { code: "CONFLICT", message: "This value already exists" } });
  }
  console.error(err);
  res.status(500).json({ error: { code: "SERVER_ERROR", message: "Something went wrong on the server" } });
}

module.exports = { notFound, errorHandler };
