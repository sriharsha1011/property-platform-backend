const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");
const filters = require("../utils/propertyFilter");
const files = require("../utils/files");
const propertyService = require("../services/property.service");
const preferenceService = require("../services/preference.service");

const MAX_IMAGES = 20;

const isAdmin = (user) => env.adminEmails.includes((user.email || "").toLowerCase());

// Loads the property and checks that this user may change it (owner or admin)
async function loadOwned(req) {
  const property = await propertyService.findByID(req.params.propertyID);
  if (!property) throw ApiError.notFound("Property not found");
  if (property.createdBy !== req.user.userID && !isAdmin(req.user)) throw ApiError.forbidden("Only the owner can change this property");
  return property;
}
exports.loadOwned = loadOwned;

// GET /api/properties : search with budget and interior filters
exports.listProperties = async (req, res) => {
  const { filter, sort, page, limit } = filters.fromQuery(req.query);
  const { data, total } = await propertyService.list(filter, sort, (page - 1) * limit, limit);
  res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
};

// GET /api/properties/recommended : uses the logged-in user's saved preferences as filters
exports.recommended = async (req, res) => {
  const pref = await preferenceService.findByUser(req.user.userID);
  if (!pref) throw ApiError.notFound("Save your preferences first (POST /api/preferences)", "PREFERENCES_NOT_FOUND");
  const { sort, page, limit } = filters.fromQuery({ sort: req.query.sort, page: req.query.page, limit: req.query.limit });
  const { data, total } = await propertyService.list(filters.fromPreferences(pref), sort, (page - 1) * limit, limit);
  res.json({ data, total, page, limit, pages: Math.ceil(total / limit), preferences: pref });
};

exports.getProperty = async (req, res) => {
  const property = await propertyService.findByID(req.params.propertyID);
  if (!property) throw ApiError.notFound("Property not found");
  res.json({ data: property });
};

exports.createProperty = async (req, res) => {
  const property = await propertyService.create({
    ...req.valid,
    propertyID: `p_${crypto.randomUUID().slice(0, 8)}`,
    createdBy: req.user.userID,
  });
  res.status(201).json({ data: property });
};

exports.updateProperty = async (req, res) => {
  const old = await loadOwned(req);
  const updated = await propertyService.update(old.propertyID, req.valid);
  if (!updated) throw ApiError.notFound("Property not found");
  // Links that were replaced by this update: remove their local files if any
  if (req.valid.images) await files.deleteLocalImages((old.images || []).filter((u) => files.isLocalImage(u) && !req.valid.images.includes(u)));
  res.json({ data: updated });
};

exports.deleteProperty = async (req, res) => {
  const property = await loadOwned(req);
  await propertyService.remove(property.propertyID);
  await files.deleteLocalImages(property.images);
  res.status(204).end();
};

// POST /api/properties/:propertyID/images (multipart, field name "images")
exports.uploadImages = async (req, res) => {
  const property = req.property;
  if ((property.images || []).length + req.files.length > MAX_IMAGES) {
    await files.deleteFiles(req.files);
    throw ApiError.badRequest(`A property can have at most ${MAX_IMAGES} images`);
  }
  const urls = req.files.map((f) => files.publicUrl(f.filename));
  const updated = await propertyService.addImages(property.propertyID, urls);
  if (!updated) {
    await files.deleteFiles(req.files);
    throw ApiError.notFound("Property not found");
  }
  res.status(201).json({ data: updated, uploaded: urls });
};

// DELETE /api/properties/:propertyID/images  body: { "image": "<link>" }
exports.deleteImage = async (req, res) => {
  const { image } = req.valid;
  if (!(req.property.images || []).includes(image)) throw ApiError.notFound("This image is not on the property");
  const updated = await propertyService.removeImage(req.property.propertyID, image);
  await files.deleteLocalImages([image]);
  res.json({ data: updated });
};
