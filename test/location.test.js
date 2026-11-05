// Run with: npm test   (no database needed)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_secret_for_unit_tests_only";

const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");
const db = require("../src/config/db");
const propService = require("../src/services/property.service");
const { suggest, cities } = require("../src/utils/places");
const { toFilter, fromRequest } = require("../src/utils/searchCriteria");
const validator = require("../src/validators/property.validator");
const seedHomes = require("../scripts/seedHomes.json");

const localities = [
  { locality: "Koramangala", city: "Bengaluru", state: "Karnataka", lat: 12.93, lng: 77.62, count: 3 },
  { locality: "Kondapur", city: "Hyderabad", state: "Telangana", lat: 17.47, lng: 78.36, count: 2 },
];

let server, base;
before(async () => {
  mock.method(db, "isConnected", () => true);
  mock.method(propService, "localities", async () => localities);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { mock.restoreAll(); server.close(); });

// ---------- the pure function ----------
test("city list covers all of India (many states)", () => {
  assert.ok(cities.length >= 80);
  assert.ok(new Set(cities.map((c) => c.state)).size >= 25);
  assert.ok(cities.every((c) => c.lat > 6 && c.lat < 37 && c.lng > 67 && c.lng < 98));
});
test("suggest: starts-with matches come first, localities before cities", () => {
  const r = suggest("ko", localities);
  assert.equal(r[0].type, "locality");
  assert.ok(r.some((x) => x.name === "Kolkata" && x.type === "city"));
  assert.ok(r.every((x) => x.lat && x.lng && x.state));
});
test("suggest: any Indian city can be found, even one with no homes", () => {
  assert.equal(suggest("jodh", [])[0].name, "Jodhpur");
  assert.equal(suggest("JODHPUR", [])[0].state, "Rajasthan");
});
test("suggest: a state name finds its cities; empty text and no match give []", () => {
  assert.ok(suggest("goa", []).some((x) => x.name === "Panaji"));
  assert.deepEqual(suggest("", localities), []);
  assert.deepEqual(suggest("zzzzqq", localities), []);
});
test("suggest: respects the limit", () => {
  assert.equal(suggest("a", localities, 3).length, 3);
});

// ---------- the endpoint ----------
test("GET /api/locations/suggest returns suggestions", async () => {
  const res = await fetch(`${base}/api/locations/suggest?q=hyder`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data[0].name, "Hyderabad");
});
test("GET /api/locations/suggest with no text gives an empty list", async () => {
  const body = await (await fetch(`${base}/api/locations/suggest`)).json();
  assert.deepEqual(body.data, []);
});
test("GET /api/locations/suggest: limit is kept between 1 and 20", async () => {
  const body = await (await fetch(`${base}/api/locations/suggest?q=a&limit=999`)).json();
  assert.ok(body.data.length <= 20);
});

// ---------- state filter and validation ----------
test("search: ?state= and ?city= both become filters", () => {
  const req = fromRequest({ city: "Pune", state: "Maharashtra" });
  const f = toFilter(req);
  assert.ok(f["location.city"].$regex.includes("Pune"));
  assert.ok(f["location.state"].$regex.includes("Maharashtra"));
});
test("property validator accepts a state and rejects an empty one", () => {
  const ok = { ...seedHomes[12], location: { ...seedHomes[12].location } };
  delete ok.propertyID; delete ok.images; delete ok.availability;
  assert.deepEqual(validator.create(ok).errors, []);
  assert.equal(validator.create(ok).value.location.state, ok.location.state);
  ok.location.state = "  ";
  assert.equal(validator.create(ok).errors[0].field, "location.state");
});

// ---------- the sample data ----------
test("sample homes: unique IDs, valid positions, 4 photos each, many cities", () => {
  assert.equal(new Set(seedHomes.map((h) => h.propertyID)).size, seedHomes.length);
  assert.ok(new Set(seedHomes.map((h) => h.location.city)).size >= 15);
  for (const h of seedHomes) {
    assert.ok(h.location.latitude && h.location.longitude, h.propertyID);
    assert.ok(h.location.state, h.propertyID);
    assert.equal(h.images.length, 4, h.propertyID);
  }
});
test("sample photos exist on disk and are served", async () => {
  const fs = require("fs");
  const path = require("path");
  const all = new Set(seedHomes.flatMap((h) => h.images));
  for (const url of all) assert.ok(fs.existsSync(path.join(__dirname, "..", "seed-images", path.basename(url))), url);
  const res = await fetch(`${base}${[...all][0]}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /svg/);
});
