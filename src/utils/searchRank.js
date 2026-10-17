// The ranking part of the search algorithm. Pure functions: no database, easy to test.
//
// Idea: MongoDB first removes properties that can never fit (budget, availability, city).
// Then every remaining property gets a relevance score from 0 to 100, based on how many of
// the user's wishes (location, BHK, furnishing, flooring, style, modular kitchen) it matches.
// Only the wishes the user gave are counted, so a short wish list can still reach 100.

const WEIGHTS = { locality: 25, bhk: 20, furnishing: 15, flooring: 10, style: 10, modularKitchen: 10, budget: 10 };
const same = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
const inList = (list, v) => list.some((x) => same(x, v));

// A cheaper property inside the budget scores a bit higher. Inside the budget it never gets less than 40% of the points.
function budgetFraction(price, { min, max }) {
  if (max === undefined) return 1;
  if (price > max || (min !== undefined && price < min)) return 0;
  const low = min ?? 0;
  const position = max > low ? (price - low) / (max - low) : 0; // 0 = cheapest, 1 = at the maximum
  return 0.4 + 0.6 * (1 - position);
}

// Returns { score (0-100 or null when there are no wishes), matched: [...], missed: [...] }
function scoreProperty(p, c) {
  const f = p.interiorFeatures || {};
  let earned = 0;
  let possible = 0;
  const matched = [];
  const missed = [];
  const add = (key, applies, fraction) => {
    if (!applies) return;
    possible += WEIGHTS[key];
    earned += WEIGHTS[key] * fraction;
    (fraction > 0 ? matched : missed).push(key);
  };

  add("locality", c.locality.length > 0, inList(c.locality, p.location?.locality) ? 1 : 0);
  add("bhk", c.bhk !== undefined || c.minBhk !== undefined, c.bhk !== undefined ? (f.bhk === c.bhk ? 1 : 0) : f.bhk >= c.minBhk ? 1 : 0);
  add("furnishing", c.furnishing.length > 0, c.furnishing.includes(f.furnishing) ? 1 : 0);
  add("flooring", c.flooringType.length > 0, inList(c.flooringType, f.flooringType) ? 1 : 0);
  add("style", c.style.length > 0, inList(c.style, f.style) ? 1 : 0);
  add("modularKitchen", c.modularKitchen !== undefined, (f.modularKitchen === true) === c.modularKitchen ? 1 : 0);
  add("budget", c.budget.min !== undefined || c.budget.max !== undefined, budgetFraction(p.price, c.budget));

  return { score: possible ? Math.round((100 * earned) / possible) : null, matched, missed };
}

const byPrice = (a, b) => a.price - b.price || (a.propertyID < b.propertyID ? -1 : 1);
const SORTERS = {
  // best match first; ties go to the cheaper property
  relevance: (a, b) => (b.relevance.score ?? 0) - (a.relevance.score ?? 0) || byPrice(a, b),
  price_asc: byPrice,
  price_desc: (a, b) => b.price - a.price || (a.propertyID < b.propertyID ? -1 : 1),
  area_desc: (a, b) => (b.interiorFeatures?.areaSqFt ?? 0) - (a.interiorFeatures?.areaSqFt ?? 0) || byPrice(a, b),
  location: (a, b) => String(a.location?.locality).localeCompare(String(b.location?.locality)) || byPrice(a, b),
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt) || byPrice(a, b),
};

// Adds `relevance` to every property, removes those below minScore, and sorts.
function rank(properties, criteria, { sort = "relevance", minScore = 0 } = {}) {
  return properties
    .map((p) => ({ ...p, relevance: scoreProperty(p, criteria) }))
    .filter((p) => p.relevance.score === null || p.relevance.score >= minScore)
    .sort(SORTERS[sort]);
}

module.exports = { WEIGHTS, SORTERS, scoreProperty, budgetFraction, rank };
