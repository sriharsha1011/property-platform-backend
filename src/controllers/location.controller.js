const propertyService = require("../services/property.service");
const { suggest } = require("../utils/places");

// GET /api/locations/suggest?q=kor&limit=8
// Returns cities from all over India plus localities that have homes in our database.
exports.suggest = async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 20);
  if (!q) return res.json({ data: [] });
  const localities = await propertyService.localities();
  res.json({ data: suggest(q, localities, limit) });
};
