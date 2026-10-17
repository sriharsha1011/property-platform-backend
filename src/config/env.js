// Reads settings from the .env file in one place
require("dotenv").config();
const path = require("path");

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
  dbName: process.env.DB_NAME || "property_platform",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  // These users can edit or delete any property
  adminEmails: (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  // Folder where uploaded images are saved
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "uploads"),
});
