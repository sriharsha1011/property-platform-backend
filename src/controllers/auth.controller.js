const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const { signToken } = require("../utils/token");
const authService = require("../services/auth.service");

// Used when the user is not found, so a wrong email takes the same time as a wrong password
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const publicUser = ({ userID, username, email, dateJoined }) => ({ userID, username, email, dateJoined });

// POST /api/auth/signup
exports.signup = async (req, res) => {
  const { username, email, password } = req.valid;

  const existing = await authService.findByEmailOrUsername({ email, username });
  if (existing) throw ApiError.conflict(existing.email === email ? "This email is already registered" : "This username is taken");

  const user = await authService.createUser({
    userID: `u_${crypto.randomUUID().slice(0, 8)}`,
    username,
    email,
    passwordHash: await bcrypt.hash(password, 10),
  });
  res.status(201).json({ token: signToken(user.userID), user: publicUser(user) });
};

// POST /api/auth/login
exports.login = async (req, res) => {
  const { email, username, password } = req.valid;

  const user = await authService.findByEmailOrUsername({ email, username });
  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  // Same message for "no such user" and "wrong password", so nobody can find out which emails exist
  if (!user || !passwordOk) throw ApiError.unauthorized("Wrong email/username or password", "INVALID_CREDENTIALS");

  res.json({ token: signToken(user.userID), user: publicUser(user) });
};

// POST /api/auth/logout  (needs a token)
exports.logout = async (req, res) => {
  await authService.revoke(req.token.jti, req.token.exp);
  res.json({ message: "Logged out" });
};

// GET /api/auth/me  (needs a token)
exports.me = (req, res) => {
  res.json({ user: publicUser(req.user) });
};
