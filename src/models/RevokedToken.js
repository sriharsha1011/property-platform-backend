const { Schema, model } = require("mongoose");

// Tokens that were logged out. MongoDB deletes each one by itself after it expires.
const revokedTokenSchema = new Schema(
  {
    jti: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "revokedTokens", versionKey: false }
);
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model("RevokedToken", revokedTokenSchema);
