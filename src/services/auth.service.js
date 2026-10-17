// All database work for authentication lives here. Controllers call these functions.
const { User, RevokedToken } = require("../models");

exports.findByEmailOrUsername = ({ email, username }) => {
  const or = [];
  if (email) or.push({ email });
  if (username) or.push({ username });
  // "+passwordHash" asks for the hash, which is hidden by default
  return User.findOne({ $or: or }).select("+passwordHash").lean();
};

exports.findByID = (userID) => User.findOne({ userID }).lean();

exports.createUser = async (data) => {
  const doc = await User.create(data);
  const { passwordHash, _id, ...safe } = doc.toObject(); // never send the hash back
  return safe;
};

exports.isRevoked = async (jti) => Boolean(await RevokedToken.exists({ jti }));

exports.revoke = (jti, expSeconds) =>
  RevokedToken.updateOne({ jti }, { $setOnInsert: { jti, expiresAt: new Date(expSeconds * 1000) } }, { upsert: true });
