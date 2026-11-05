const ApiError = require("../utils/ApiError");
const propertyService = require("../services/property.service");
const preferenceService = require("../services/preference.service");
const { fromRequest, toFilter, CANDIDATE_LIMIT } = require("../utils/searchCriteria");
const { rank } = require("../utils/searchRank");

// GET /api/search
//   ?usePreferences=true   use my saved preferences (login needed); values in the URL win over them
//   &strict=true           every wish must match (not only rank higher)
//   &sort=relevance|price_asc|price_desc|area_desc|location|newest
exports.search = async (req, res) => {
  let prefs;
  if (req.query.usePreferences === "true") {
    prefs = await preferenceService.findByUser(req.user.userID);
    if (!prefs) throw ApiError.notFound("Save your preferences first (POST /api/preferences)", "PREFERENCES_NOT_FOUND");
  }
  const request = fromRequest(req.query, prefs);
  const candidates = await propertyService.candidates(toFilter(request), CANDIDATE_LIMIT);
  const ranked = rank(candidates, request.criteria, { sort: request.sort, minScore: request.minScore });

  const start = (request.page - 1) * request.limit;
  res.json({
    data: ranked.slice(start, start + request.limit),
    total: ranked.length,
    page: request.page,
    limit: request.limit,
    pages: Math.ceil(ranked.length / request.limit),
    sort: request.sort,
    strict: request.strict,
    criteria: request.criteria,
    city: request.city,
    state: request.state,
    // true when more than CANDIDATE_LIMIT properties passed the budget filter. Narrow the budget to see all.
    truncated: candidates.length === CANDIDATE_LIMIT,
  });
};
