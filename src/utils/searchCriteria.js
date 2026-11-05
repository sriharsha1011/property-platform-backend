const ApiError = require("./ApiError");
const { csv, anyOf, num, bool, furnishingList, parsePaging } = require("./query");
const { SORTERS } = require("./searchRank");

const CANDIDATE_LIMIT = 500;

// Reads the URL query (and the saved preferences, if asked) into one "criteria" object.
// A value in the URL always wins over the saved preference.
function fromRequest(q, prefs) {
  const errors = [];
  const { page, limit } = parsePaging(q);
  const ip = prefs?.interiorPreferences || {};

  const minPrice = num(q, "minPrice", errors, { min: 0 });
  const maxPrice = num(q, "maxPrice", errors, { min: 0 });
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) errors.push({ field: "minPrice", message: "must not be more than maxPrice" });
  const bhk = num(q, "bhk", errors, { int: true, min: 1 });
  const minBhk = num(q, "minBhk", errors, { int: true, min: 1 });
  const furnishing = furnishingList(q, "furnishing", errors);
  const modularKitchen = bool(q, "modularKitchen", errors);
  const available = bool(q, "available", errors);
  const strict = bool(q, "strict", errors);
  const minScore = num(q, "minScore", errors, { min: 0 });
  if (minScore !== undefined && minScore > 100) errors.push({ field: "minScore", message: "must be from 0 to 100" });
  const sort = q.sort ?? "relevance";
  if (!SORTERS[sort]) errors.push({ field: "sort", message: `must be one of: ${Object.keys(SORTERS).join(", ")}` });
  if (errors.length) throw ApiError.badRequest("Some search values are not valid", errors);

  const queryBudget = minPrice !== undefined || maxPrice !== undefined;
  const queryBhk = bhk !== undefined || minBhk !== undefined;
  const criteria = {
    budget: queryBudget ? { min: minPrice, max: maxPrice } : { min: prefs?.budgetRange?.min, max: prefs?.budgetRange?.max },
    locality: csv(q.locality).length ? csv(q.locality) : prefs?.preferredLocation || [],
    bhk: queryBhk ? bhk : undefined,
    minBhk: queryBhk ? minBhk : ip.minBhk,
    furnishing: furnishing.length ? furnishing : ip.furnishing || [],
    flooringType: csv(q.flooringType).length ? csv(q.flooringType) : ip.flooringType || [],
    style: csv(q.style).length ? csv(q.style) : ip.style || [],
    modularKitchen: modularKitchen !== undefined ? modularKitchen : ip.modularKitchen,
  };
  return { criteria, city: q.city ? String(q.city).trim() : undefined, state: q.state ? String(q.state).trim() : undefined, available: available ?? true, strict: strict === true, minScore: minScore ?? 0, sort, page, limit };
}

// MongoDB filter. Budget, availability and city always remove properties.
// The other wishes only remove properties when strict=true; otherwise they only change the ranking.
function toFilter({ criteria: c, city, state, available, strict }) {
  const filter = { availability: available };
  if (c.budget.min !== undefined || c.budget.max !== undefined) {
    filter.price = {};
    if (c.budget.min !== undefined) filter.price.$gte = c.budget.min;
    if (c.budget.max !== undefined) filter.price.$lte = c.budget.max;
  }
  if (city) filter["location.city"] = anyOf([city]);
  if (state) filter["location.state"] = anyOf([state]);
  if (strict) {
    if (c.locality.length) filter.$or = [{ "location.locality": anyOf(c.locality) }, { "location.city": anyOf(c.locality) }];
    if (c.bhk !== undefined) filter["interiorFeatures.bhk"] = c.bhk;
    else if (c.minBhk !== undefined) filter["interiorFeatures.bhk"] = { $gte: c.minBhk };
    if (c.furnishing.length) filter["interiorFeatures.furnishing"] = { $in: c.furnishing };
    if (c.flooringType.length) filter["interiorFeatures.flooringType"] = anyOf(c.flooringType);
    if (c.style.length) filter["interiorFeatures.style"] = anyOf(c.style);
    if (c.modularKitchen !== undefined) filter["interiorFeatures.modularKitchen"] = c.modularKitchen;
  }
  return filter;
}

module.exports = { fromRequest, toFilter, CANDIDATE_LIMIT };
