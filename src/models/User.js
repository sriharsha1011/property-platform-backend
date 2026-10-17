const { Schema, model } = require("mongoose");

const userSchema = new Schema(
  {
    userID: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, trim: true, match: /^[A-Za-z0-9_]{3,30}$/ },
    // select:false means queries do not return the hash unless asked
    passwordHash: { type: String, required: true, select: false },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    dateJoined: { type: Date, default: Date.now },
  },
  { collection: "users", versionKey: false, autoIndex: false }
);

module.exports = model("User", userSchema);
