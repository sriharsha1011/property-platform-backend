// All database work for user preferences lives here.
const { UserPreference } = require("../models");

exports.findByUser = (userID) => UserPreference.findOne({ userID }).select("-_id").lean();

exports.create = async (data) => {
  const doc = await UserPreference.create(data);
  const { _id, ...rest } = doc.toObject();
  return rest;
};

// The API validator already checks the values (for example min <= max), so model validators are not repeated here
exports.update = (userID, changes) =>
  UserPreference.findOneAndUpdate({ userID }, { $set: changes }, { returnDocument: "after", runValidators: false }).select("-_id").lean();

exports.remove = (userID) => UserPreference.deleteOne({ userID });
