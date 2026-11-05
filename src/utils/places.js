// Place suggestions for the location search box (typeahead).
// Two sources are mixed:
//   1. a built-in list of Indian cities (src/data/indiaCities.json), so any city can be searched
//   2. localities that already exist in the database (so the list grows when new homes are added)
// Pure functions: no database here, so they are easy to test.
const cities = require("../data/indiaCities.json");

const clean = (s) => String(s ?? "").trim().toLowerCase();

// 0 = starts with the text, 1 = a word inside starts with it, 2 = contains it, -1 = no match
function matchRank(name, q) {
  const n = clean(name);
  if (n.startsWith(q)) return 0;
  if (n.split(/[\s-]+/).some((w) => w.startsWith(q))) return 1;
  return n.includes(q) ? 2 : -1;
}

// localities: [{ locality, city, state, lat, lng, count }]  (made from the database)
function suggest(text, localities = [], limit = 8) {
  const q = clean(text);
  if (q.length < 1) return [];
  const found = [];

  for (const c of cities) {
    // typing a state name (like "goa") also finds its cities, but after the name matches
    let r = matchRank(c.name, q);
    if (r < 0 && matchRank(c.state, q) === 0) r = 2;
    if (r >= 0) found.push({ rank: r, item: { type: "city", name: c.name, city: c.name, state: c.state, lat: c.lat, lng: c.lng } });
  }
  for (const l of localities) {
    const r = matchRank(l.locality, q);
    if (r >= 0) {
      found.push({ rank: r, item: { type: "locality", name: l.locality, city: l.city, state: l.state, lat: l.lat, lng: l.lng, homes: l.count } });
    }
  }
  // better match first; localities before cities when equal (they are more exact); then A to Z
  found.sort((a, b) => a.rank - b.rank || (a.item.type === b.item.type ? 0 : a.item.type === "locality" ? -1 : 1) || a.item.name.localeCompare(b.item.name));
  return found.slice(0, limit).map((f) => f.item);
}

module.exports = { suggest, cities };
