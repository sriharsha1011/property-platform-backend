// Run with: npm test   (no database needed)
process.env.NODE_ENV = "test";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");
const { Property, User, UserPreference } = require("../src/models");

// Returns the validation error, or null if the document is fine
const check = (doc) => doc.validate().then(() => null, (e) => e);

let server, base;
before(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
after(() => server.close());

test("health check works", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
});

test("unknown route gives a 404 in the standard error shape", async () => {
  const res = await fetch(`${base}/api/nothing`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, "NOT_FOUND");
});

test("bad JSON gives a 400", async () => {
  const res = await fetch(`${base}/api/health`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
  assert.equal(res.status, 400);
});

test("database routes give 503 when MongoDB is not connected", async () => {
  const res = await fetch(`${base}/api/properties`);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "DB_UNAVAILABLE");
});

test("Property model accepts a record shaped like the seed data", async () => {
  const err = await check(new Property({
    propertyID: "p_1001", name: "Sunrise Heights 2BHK",
    location: { address: "12, 5th Cross", city: "Bengaluru", locality: "HSR Layout", pincode: "560102", latitude: 12.9116, longitude: 77.6474 },
    price: 8500000,
    interiorFeatures: { bhk: 2, flooringType: "Vitrified", furnishing: "Semi-furnished", style: "Modern", modularKitchen: true, areaSqFt: 1100,
      rooms: [{ type: "Living Room", lengthFt: 16, widthFt: 13 }] },
    images: ["https://example.com/images/p_1001_1.jpg"], availability: true,
  }));
  assert.equal(err, null);
});

test("Property model rejects wrong values", async () => {
  const err = await check(new Property({ propertyID: "x", name: "A", location: { address: "a", city: "b", locality: "c" }, price: -5,
    interiorFeatures: { bhk: 2, flooringType: "Wooden", furnishing: "Half", areaSqFt: 900 } }));
  assert.ok(err.errors["price"]);
  assert.ok(err.errors["interiorFeatures.furnishing"]);
});

test("User and UserPreference models check their fields", async () => {
  assert.equal(await check(new User({ userID: "u_1", username: "harsha_10", passwordHash: "x", email: "A@Example.com" })), null);
  assert.ok(await check(new User({ userID: "u_1", username: "no spaces", passwordHash: "x", email: "bad" })));
  const ok = new UserPreference({ preferenceID: "pr_1", userID: "u_1", preferredLocation: ["HSR Layout"], budgetRange: { min: 6000000, max: 9000000 } });
  assert.equal(await check(ok), null);
  const bad = new UserPreference({ preferenceID: "pr_1", userID: "u_1", budgetRange: { min: 9000000, max: 6000000 } });
  assert.ok(await check(bad));
});
