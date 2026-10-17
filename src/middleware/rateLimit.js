const rateLimit = require("express-rate-limit");
const env = require("../config/env");

// Stops people from guessing passwords: 20 tries per 15 minutes from one address
module.exports.authLimiter =
  env.nodeEnv === "test"
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: { code: "RATE_LIMITED", message: "Too many tries. Please wait and try again" } },
      });
