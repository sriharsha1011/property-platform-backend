const ApiError = require("../utils/ApiError");
const db = require("../config/db");

// Put this before any route that needs the database
module.exports = function requireDb(req, res, next) {
  if (!db.isConnected()) return next(new ApiError(503, "DB_UNAVAILABLE", "Database is not connected"));
  next();
};
