const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const service = require("../services/preference.service");

// Each user has one preference record. These endpoints always work on the logged-in user's own record.
exports.create = async (req, res) => {
  if (await service.findByUser(req.user.userID)) throw ApiError.conflict("You already have preferences. Use PATCH /api/preferences/me to change them");
  const data = await service.create({ ...req.valid, preferenceID: `pr_${crypto.randomUUID().slice(0, 8)}`, userID: req.user.userID });
  res.status(201).json({ data });
};

exports.getMine = async (req, res) => {
  const data = await service.findByUser(req.user.userID);
  if (!data) throw ApiError.notFound("You have not saved preferences yet", "PREFERENCES_NOT_FOUND");
  res.json({ data });
};

exports.updateMine = async (req, res) => {
  const data = await service.update(req.user.userID, req.valid);
  if (!data) throw ApiError.notFound("You have not saved preferences yet", "PREFERENCES_NOT_FOUND");
  res.json({ data });
};

exports.deleteMine = async (req, res) => {
  const r = await service.remove(req.user.userID);
  if (!r.deletedCount) throw ApiError.notFound("You have not saved preferences yet", "PREFERENCES_NOT_FOUND");
  res.status(204).end();
};
