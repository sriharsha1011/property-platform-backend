const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../config/env");

// Makes a login token. "sub" = the user, "jti" = a unique ID so we can cancel it at logout.
function signToken(userID) {
  return jwt.sign({}, env.jwtSecret, {
    algorithm: "HS256",
    subject: userID,
    jwtid: crypto.randomUUID(),
    expiresIn: env.jwtExpiresIn,
  });
}

// Throws if the token is fake, changed or expired
function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
}

module.exports = { signToken, verifyToken };
