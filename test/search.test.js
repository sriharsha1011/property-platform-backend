// Run with: npm test   (no database needed)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_secret_for_unit_tests_only";

const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");
const db = require("../src/config/db");
const authService = require("../src/services/auth.service");
const propService = require("../src/services/property.service");
const prefService = require("../src/services/preference.service");
const { signToken } = require("../src/utils/token");
const { rank, scoreProperty, budgetFraction } = require("../src/utils/searchRank");
const seed = require("./fixtures/properties.json");
const { toFilter, fromRequest } = require("../src/utils/searchCriteria");

// tiny Mongo-style matcher ($gte, $lte, $in, $regex, dotted paths, equality)
const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const matches = (doc, filter) => Object.entries(filter).every(([k, c]) => {
  if (k === "$or") return c.some((f) => matches(doc, f));
  const v = getPath(doc, k);
  if (c && typeof c === "object") {
    if ("$gte" in c && !(v >= c.$gte)) return false;
    if ("$lte" in c && !(v <= c.$lte)) return false;
    if ("$in" in c && !c.$in.includes(v)) return false;
    if ("$regex" in c && !new RegExp(c.$regex, c.$options).test(String(v ?? ""))) return false;
    return true;
  }
  return v === c;
});

const emptyC = () => ({ budget: {}, locality: [], bhk: undefined, minBhk: undefined, furnishing: [], flooringType: [], style: [], modularKitchen: undefined });
const P = (id) => seed.find((p) => p.propertyID === id);

// ---------- pure ranking ----------
test("no wishes: score is null and order is cheapest first", () => {
  const r = rank(seed, emptyC());
  assert.ok(r.every((p) => p.relevance.score === null));
  assert.deepEqual(r.map((p) => p.price), [...seed].map((p) => p.price).sort((a, b) => a - b));
});
test("a property that matches every wish scores 100, and misses are listed", () => {
  const p1 = P("p_1001"); // HSR Layout, 2 BHK, Semi-furnished, Vitrified, modular kitchen
  const c = { ...emptyC(), locality: ["hsr layout"], minBhk: 2, furnishing: ["Semi-furnished"], flooringType: ["vitrified"], modularKitchen: true };
  const s = scoreProperty(p1, c);
  assert.equal(s.score, 100);
  assert.deepEqual(s.missed, []);
  const bad = scoreProperty(P("p_1003"), c); // Indiranagar, 1 BHK, Unfurnished, Tiles, no modular kitchen
  assert.equal(bad.score, 0);
  assert.deepEqual(bad.matched, []);
});
test("score is a share of the wishes given (weights 25/20/15/10/10/10/10)", () => {
  // locality (25) matches, bhk (20) fails -> 25 / 45 = 56
  const s = scoreProperty(P("p_1003"), { ...emptyC(), locality: ["Indiranagar"], minBhk: 2 });
  assert.equal(s.score, 56);
  assert.deepEqual(s.matched, ["locality"]);
  assert.deepEqual(s.missed, ["bhk"]);
});
test("exact bhk differs from minBhk", () => {
  assert.equal(scoreProperty(P("p_1002"), { ...emptyC(), bhk: 2 }).score, 0); // 3 BHK
  assert.equal(scoreProperty(P("p_1002"), { ...emptyC(), minBhk: 2 }).score, 100);
});
test("budget fit: cheaper inside the budget is better, outside is 0", () => {
  const b = { min: 5000000, max: 10000000 };
  assert.equal(budgetFraction(5000000, b), 1);
  assert.equal(budgetFraction(10000000, b), 0.4);
  assert.ok(budgetFraction(6000000, b) > budgetFraction(9000000, b));
  assert.equal(budgetFraction(10000001, b), 0);
  assert.equal(budgetFraction(4999999, b), 0);
});
test("relevance sort puts the better match first; ties go to the cheaper one", () => {
  const c = { ...emptyC(), minBhk: 2 };
  const r = rank(seed, c);
  const scores = r.map((p) => p.relevance.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  const tied = r.filter((p) => p.relevance.score === 100);
  assert.deepEqual(tied.map((p) => p.price), tied.map((p) => p.price).sort((a, b) => a - b));
});
test("other sorts and minScore", () => {
  const c = { ...emptyC(), minBhk: 2 };
  assert.deepEqual(rank(seed, c, { sort: "price_desc" }).map((p) => p.price), seed.map((p) => p.price).sort((a, b) => b - a));
  assert.deepEqual(rank(seed, c, { sort: "area_desc" }).map((p) => p.interiorFeatures.areaSqFt), seed.map((p) => p.interiorFeatures.areaSqFt).sort((a, b) => b - a));
  const loc = rank(seed, c, { sort: "location" }).map((p) => p.location.locality);
  assert.deepEqual(loc, [...loc].sort((a, b) => a.localeCompare(b)));
  const only = rank(seed, c, { minScore: 100 });
  assert.equal(only.length, seed.filter((p) => p.interiorFeatures.bhk >= 2).length);
});

// ---------- endpoint ----------
let server, base, props, prefs;
before(async () => {
  mock.method(db, "isConnected", () => true);
  mock.method(authService, "isRevoked", async () => false);
  mock.method(authService, "findByID", async (id) => ({ userID: id, email: `${id}@example.com` }));
  mock.method(propService, "candidates", async (filter, limit) =>
    props.filter((p) => matches(p, filter)).sort((a, b) => a.price - b.price || (a.propertyID < b.propertyID ? -1 : 1)).slice(0, limit));
  mock.method(prefService, "findByUser", async (id) => prefs.find((x) => x.userID === id) || null);
  await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
after(() => server.close());
beforeEach(() => { props = JSON.parse(JSON.stringify(seed)); prefs = []; });
const get = (q, token) => fetch(`${base}/api/search${q}`, { headers: token ? { Authorization: `Bearer ${signToken(token)}` } : {} });
const ids = (r) => r.data.map((p) => p.propertyID);

test("search without wishes: available properties only, cheapest first", async () => {
  const r = await (await get("?limit=50")).json();
  assert.equal(r.total, seed.filter((p) => p.availability).length);
  assert.ok(!ids(r).includes("p_1005"));
  assert.equal(r.sort, "relevance");
  assert.equal(r.data[0].relevance.score, null);
});
test("budget is a hard limit; interior wishes only rank (not strict)", async () => {
  const r = await (await get("?minPrice=5000000&maxPrice=10000000&minBhk=2&modularKitchen=true&furnishing=Semi-furnished&limit=50")).json();
  const inBudget = seed.filter((p) => p.availability && p.price >= 5000000 && p.price <= 10000000);
  assert.equal(r.total, inBudget.length); // nobody removed by interior wishes
  const best = r.data[0];
  assert.equal(best.relevance.score >= r.data.at(-1).relevance.score, true);
  const perfect = inBudget.filter((p) => p.interiorFeatures.bhk >= 2 && p.interiorFeatures.modularKitchen && p.interiorFeatures.furnishing === "Semi-furnished").map((p) => p.propertyID);
  assert.ok(perfect.length > 0);
  for (const id of perfect) assert.ok(ids(r).indexOf(id) < ids(r).indexOf("p_1003"), `${id} should rank above the 1 BHK flat`);
});
test("strict=true removes properties that miss a wish", async () => {
  const r = await (await get("?maxPrice=10000000&minBhk=2&modularKitchen=true&strict=true&limit=50")).json();
  const expected = seed.filter((p) => p.availability && p.price <= 10000000 && p.interiorFeatures.bhk >= 2 && p.interiorFeatures.modularKitchen).map((p) => p.propertyID);
  assert.deepEqual(ids(r).sort(), expected.sort());
  assert.ok(r.data.every((p) => p.relevance.score >= 80), "all wishes met, only the budget fit changes the score");
});
test("usePreferences needs login and saved preferences", async () => {
  assert.equal((await get("?usePreferences=true")).status, 401);
  const r = await get("?usePreferences=true", "u_2001");
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, "PREFERENCES_NOT_FOUND");
});
test("usePreferences applies the saved wishes, and the URL wins over them", async () => {
  prefs.push({ userID: "u_2001", preferredLocation: ["HSR Layout"], budgetRange: { min: 5000000, max: 10000000 }, interiorPreferences: { minBhk: 2, furnishing: ["Semi-furnished"] } });
  const r = await (await get("?usePreferences=true&limit=50", "u_2001")).json();
  assert.equal(r.criteria.budget.max, 10000000);
  assert.deepEqual(r.criteria.locality, ["HSR Layout"]);
  assert.equal(r.data[0].propertyID, "p_1001");
  assert.deepEqual(r.data[0].relevance.matched, ["locality", "bhk", "furnishing", "budget"]);
  assert.ok(r.data[0].relevance.score >= 90 && r.data[0].relevance.score < 100); // all wishes met, price is in the upper half of the budget
  const o = await (await get("?usePreferences=true&maxPrice=8000000&locality=Whitefield&limit=50", "u_2001")).json();
  assert.equal(o.criteria.budget.max, 8000000);
  assert.deepEqual(o.criteria.locality, ["Whitefield"]);
  assert.ok(o.data.every((p) => p.price <= 8000000 && p.price >= 0));
});
test("sorting, paging, minScore and city", async () => {
  const d = await (await get("?sort=price_desc&limit=3&page=2")).json();
  const avail = seed.filter((p) => p.availability).sort((a, b) => b.price - a.price);
  assert.deepEqual(ids(d), avail.slice(3, 6).map((p) => p.propertyID));
  assert.equal(d.pages, Math.ceil(avail.length / 3));
  const s = await (await get("?minBhk=3&minScore=100&limit=50")).json();
  assert.ok(s.data.every((p) => p.interiorFeatures.bhk >= 3));
  const c = await (await get("?city=mumbai")).json();
  assert.equal(c.total, 0);
  const all = await (await get("?available=false")).json();
  assert.deepEqual(ids(all), ["p_1005"]);
});
test("bad search values give 400", async () => {
  for (const q of ["sort=hack", "minScore=101", "minPrice=9&maxPrice=1", "furnishing=Weird", "strict=maybe", "limit=900", "bhk=abc"]) {
    const r = await get("?" + q);
    assert.equal(r.status, 400, q);
    assert.equal((await r.json()).error.code, "VALIDATION_ERROR");
  }
});
test("regex text and operator objects are harmless", async () => {
  assert.equal((await get("?locality=(a%2B)%2B%24&flooringType=.*&strict=true")).status, 200);
  assert.equal((await get("?price[$gt]=0")).status, 200);
});

test("a city name works as an area wish (score and strict filter)", () => {
  const hyd = { propertyID: "x", price: 1, availability: true, location: { locality: "Gachibowli", city: "Hyderabad" }, interiorFeatures: {} };
  assert.equal(scoreProperty(hyd, { ...emptyC(), locality: ["hyderabad"] }).score, 100);
  const f = toFilter(fromRequest({ locality: "Hyderabad", strict: "true" }));
  assert.ok(matches(hyd, f));
  assert.ok(!matches({ ...P("p_1001"), availability: true }, f));
});
