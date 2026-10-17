const ApiError = require("./ApiError");
const { csv, anyOf, num, bool, furnishingList, parsePaging } = require("./query");

const SORTS = {
  price_asc: { price: 1, propertyID: 1 },
  price_desc: { price: -1, propertyID: 1 },
  newest: { createdAt: -1, propertyID: 1 },
};

// Turns the URL query (?minPrice=...&flooringType=...) into a MongoDB filter.
// Budget and interior choices are all optional. Several values in one field mean "any of these".
function fromQuery(q) {
  const { page, limit } = parsePaging(q);
  const errors = [];
  const filter = {};

  // ----- budget -----
  const minPrice = num(q, "minPrice", errors, { min: 0 });
  const maxPrice = num(q, "maxPrice", errors, { min: 0 });
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) errors.push({ field: "minPrice", message: "must not be more than maxPrice" });
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }

  // ----- interior choices -----
  const bhk = num(q, "bhk", errors, { int: true, min: 1 });
  const minBhk = num(q, "minBhk", errors, { int: true, min: 1 });
  if (bhk !== undefined) filter["interiorFeatures.bhk"] = bhk;
  else if (minBhk !== undefined) filter["interiorFeatures.bhk"] = { $gte: minBhk };

  const furnishing = furnishingList(q, "furnishing", errors);
  if (furnishing.length) filter["interiorFeatures.furnishing"] = { $in: furnishing };
  if (csv(q.flooringType).length) filter["interiorFeatures.flooringType"] = anyOf(csv(q.flooringType));
  if (csv(q.style).length) filter["interiorFeatures.style"] = anyOf(csv(q.style));
  const modular = bool(q, "modularKitchen", errors);
  if (modular !== undefined) filter["interiorFeatures.modularKitchen"] = modular;

  // ----- place, availability, name -----
  if (csv(q.locality).length) filter["location.locality"] = anyOf(csv(q.locality));
  if (q.city) filter["location.city"] = anyOf([String(q.city).trim()]);
  const available = bool(q, "available", errors);
  if (available !== undefined) filter.availability = available;
  if (q.q) filter.name = { $regex: String(q.q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  if (q.sort !== undefined && !SORTS[q.sort]) errors.push({ field: "sort", message: `must be one of: ${Object.keys(SORTS).join(", ")}` });
  if (errors.length) throw ApiError.badRequest("Some filter values are not valid", errors);

  return { filter, sort: SORTS[q.sort || "price_asc"], page, limit };
}

// Turns a user's saved preferences into the same kind of filter
function fromPreferences(pref) {
  const ip = pref.interiorPreferences || {};
  const filter = { availability: true };
  if (pref.budgetRange) filter.price = { $gte: pref.budgetRange.min, $lte: pref.budgetRange.max };
  if (pref.preferredLocation?.length) filter["location.locality"] = anyOf(pref.preferredLocation);
  if (ip.minBhk !== undefined) filter["interiorFeatures.bhk"] = { $gte: ip.minBhk };
  if (ip.furnishing?.length) filter["interiorFeatures.furnishing"] = { $in: ip.furnishing };
  if (ip.flooringType?.length) filter["interiorFeatures.flooringType"] = anyOf(ip.flooringType);
  if (ip.style?.length) filter["interiorFeatures.style"] = anyOf(ip.style);
  if (ip.modularKitchen !== undefined) filter["interiorFeatures.modularKitchen"] = ip.modularKitchen;
  return filter;
}

module.exports = { fromQuery, fromPreferences, SORTS };
