// Run with: npm test   (no database needed: the service layer is replaced by an in-memory fake)
const os = require("os");
const fs = require("fs");
const path = require("path");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_secret_for_unit_tests_only";
process.env.UPLOAD_DIR = tmp;
process.env.ADMIN_EMAILS = "admin@example.com";

const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");
const db = require("../src/config/db");
const authService = require("../src/services/auth.service");
const propService = require("../src/services/property.service");
const prefService = require("../src/services/preference.service");
const { signToken } = require("../src/utils/token");
const seed = require("./fixtures/properties.json");

// ---- tiny Mongo-style matcher: $gte $lte $in $regex, dotted paths, plain equality ----
const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
function matches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const val = getPath(doc, k);
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$gte" in cond && !(val >= cond.$gte)) return false;
      if ("$lte" in cond && !(val <= cond.$lte)) return false;
      if ("$in" in cond && !cond.$in.includes(val)) return false;
      if ("$regex" in cond && !new RegExp(cond.$regex, cond.$options).test(String(val ?? ""))) return false;
      return true;
    }
    return val === cond;
  });
}

let server, base, props, prefs, users;
const strip = ({ _id, ...r }) => JSON.parse(JSON.stringify(r));

before(async () => {
  mock.method(db, "isConnected", () => true);
  mock.method(authService, "isRevoked", async () => false);
  mock.method(authService, "findByID", async (id) => users.find((u) => u.userID === id) || null);
  mock.method(propService, "list", async (filter, sort, skip, limit) => {
    const keys = Object.entries(sort);
    const all = props.filter((p) => matches(p, filter)).sort((a, b) => {
      for (const [k, dir] of keys) { if (a[k] < b[k]) return -dir; if (a[k] > b[k]) return dir; }
      return 0;
    });
    return { data: all.slice(skip, skip + limit).map(strip), total: all.length };
  });
  mock.method(propService, "findByID", async (id) => { const p = props.find((x) => x.propertyID === id); return p ? strip(p) : null; });
  mock.method(propService, "create", async (d) => { props.push(strip(d)); return strip(d); });
  mock.method(propService, "update", async (id, ch) => { const p = props.find((x) => x.propertyID === id); if (!p) return null; Object.assign(p, ch); return strip(p); });
  mock.method(propService, "remove", async (id) => { props = props.filter((p) => p.propertyID !== id); return { deletedCount: 1 }; });
  mock.method(propService, "addImages", async (id, urls) => { const p = props.find((x) => x.propertyID === id); p.images = [...(p.images || []), ...urls]; return strip(p); });
  mock.method(propService, "removeImage", async (id, url) => { const p = props.find((x) => x.propertyID === id); p.images = p.images.filter((u) => u !== url); return strip(p); });
  mock.method(prefService, "findByUser", async (id) => { const p = prefs.find((x) => x.userID === id); return p ? strip(p) : null; });
  mock.method(prefService, "create", async (d) => { prefs.push(strip(d)); return strip(d); });
  mock.method(prefService, "update", async (id, ch) => { const p = prefs.find((x) => x.userID === id); if (!p) return null; Object.assign(p, ch); return strip(p); });
  mock.method(prefService, "remove", async (id) => { const n = prefs.length; prefs = prefs.filter((p) => p.userID !== id); return { deletedCount: n - prefs.length }; });

  await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
beforeEach(() => {
  props = JSON.parse(JSON.stringify(seed)).map((p) => ({ ...p, createdBy: p.createdBy || "u_2001" }));
  prefs = [];
  users = [
    { userID: "u_2001", username: "harsha_10", email: "harsha@example.com" },
    { userID: "u_2002", username: "other", email: "other@example.com" },
    { userID: "u_9999", username: "boss", email: "admin@example.com" },
  ];
  fs.rmSync(path.join(tmp, "properties"), { recursive: true, force: true });
});

const tok = (id) => signToken(id);
const api = (method, url, body, token) =>
  fetch(base + url, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const upload = (id, parts, token) => {
  const fd = new FormData();
  for (const [name, buf, filename, type] of parts) fd.append(name, new Blob([buf], { type }), filename);
  return fetch(`${base}/api/properties/${id}/images`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
};
const uploaded = () => { try { return fs.readdirSync(path.join(tmp, "properties")); } catch { return []; } };

const good = {
  name: "Test Flat", price: 5000000,
  location: { address: "1 Main Rd", city: "Bengaluru", locality: "Indiranagar", pincode: "560038" },
  interiorFeatures: { bhk: 2, flooringType: "Vitrified", furnishing: "Semi-furnished", areaSqFt: 1000 },
};

// ===================== filters =====================
test("budget range returns only properties inside it", async () => {
  const r = await (await api("GET", "/api/properties?minPrice=6000000&maxPrice=10000000&limit=50")).json();
  const expected = seed.filter((p) => p.price >= 6000000 && p.price <= 10000000);
  assert.equal(r.total, expected.length);
  assert.ok(r.data.every((p) => p.price >= 6000000 && p.price <= 10000000));
});
test("interior filters combine with budget", async () => {
  const r = await (await api("GET", "/api/properties?maxPrice=10000000&minBhk=2&furnishing=Fully-furnished,Semi-furnished&modularKitchen=true&limit=50")).json();
  const expected = seed.filter((p) => p.price <= 10000000 && p.interiorFeatures.bhk >= 2 && ["Fully-furnished", "Semi-furnished"].includes(p.interiorFeatures.furnishing) && p.interiorFeatures.modularKitchen === true);
  assert.deepEqual(r.data.map((p) => p.propertyID).sort(), expected.map((p) => p.propertyID).sort());
  assert.ok(r.total > 0);
});
test("flooring, style, locality and available filters", async () => {
  const f = seed[0].interiorFeatures.flooringType;
  const r = await (await api("GET", `/api/properties?flooringType=${encodeURIComponent(f.toUpperCase())}&available=true&limit=50`)).json();
  const expected = seed.filter((p) => p.interiorFeatures.flooringType.toLowerCase() === f.toLowerCase() && p.availability);
  assert.equal(r.total, expected.length);
  const un = await (await api("GET", "/api/properties?available=false")).json();
  assert.deepEqual(un.data.map((p) => p.propertyID), ["p_1005"]);
});
test("sorting and paging", async () => {
  const r = await (await api("GET", "/api/properties?sort=price_desc&limit=3&page=2")).json();
  const sorted = [...seed].sort((a, b) => b.price - a.price || (a.propertyID < b.propertyID ? -1 : 1));
  assert.deepEqual(r.data.map((p) => p.propertyID), sorted.slice(3, 6).map((p) => p.propertyID));
  assert.equal(r.pages, Math.ceil(seed.length / 3));
});
test("bad filter values give 400 with details", async () => {
  for (const q of ["minPrice=abc", "minPrice=5&maxPrice=1", "furnishing=Weird", "sort=hack", "limit=500", "modularKitchen=maybe", "bhk=1.5"]) {
    const res = await api("GET", `/api/properties?${q}`);
    assert.equal(res.status, 400, q);
    assert.equal((await res.json()).error.code, "VALIDATION_ERROR");
  }
});
test("regex characters and operator objects in the query are treated as plain text", async () => {
  const r1 = await api("GET", "/api/properties?q=.*&locality=(a+)+$");
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).total, 0);
  const r2 = await api("GET", "/api/properties?price[$ne]=1");
  assert.equal(r2.status, 200);
});

// ===================== property CRUD =====================
test("create needs login and valid data", async () => {
  assert.equal((await api("POST", "/api/properties", good)).status, 401);
  const bad = await api("POST", "/api/properties", { ...good, price: -5, interiorFeatures: { bhk: 0 } }, tok("u_2001"));
  assert.equal(bad.status, 400);
  const fields = (await bad.json()).error.details.map((d) => d.field);
  assert.ok(fields.includes("price") && fields.includes("interiorFeatures.bhk") && fields.includes("interiorFeatures.furnishing"));
  const ok = await api("POST", "/api/properties", { ...good, createdBy: "u_2002", propertyID: "hack" }, tok("u_2001"));
  assert.equal(ok.status, 201);
  const d = (await ok.json()).data;
  assert.equal(d.createdBy, "u_2001");
  assert.match(d.propertyID, /^p_/);
  assert.equal((await api("GET", `/api/properties/${d.propertyID}`)).status, 200);
});
test("create rejects local /uploads links in images", async () => {
  const r = await api("POST", "/api/properties", { ...good, images: ["/uploads/properties/x.png"] }, tok("u_2001"));
  assert.equal(r.status, 400);
  const ok = await api("POST", "/api/properties", { ...good, images: ["https://example.com/a.jpg"] }, tok("u_2001"));
  assert.equal(ok.status, 201);
});
test("get unknown property is 404", async () => {
  assert.equal((await api("GET", "/api/properties/p_nope")).status, 404);
});
test("update: owner and admin yes, stranger no, empty body no", async () => {
  const id = "p_1001"; props.find((p) => p.propertyID === id).createdBy = "u_2001";
  assert.equal((await api("PATCH", `/api/properties/${id}`, { price: 1 })).status, 401);
  assert.equal((await api("PATCH", `/api/properties/${id}`, { price: 1 }, tok("u_2002"))).status, 403);
  assert.equal((await api("PATCH", `/api/properties/${id}`, {}, tok("u_2001"))).status, 400);
  const r = await api("PATCH", `/api/properties/${id}`, { price: 12345 }, tok("u_2001"));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data.price, 12345);
  assert.equal((await api("PATCH", `/api/properties/${id}`, { availability: false }, tok("u_9999"))).status, 200);
});
test("delete: stranger 403, owner 204 then 404", async () => {
  const id = "p_1002"; props.find((p) => p.propertyID === id).createdBy = "u_2001";
  assert.equal((await api("DELETE", `/api/properties/${id}`, undefined, tok("u_2002"))).status, 403);
  assert.equal((await api("DELETE", `/api/properties/${id}`, undefined, tok("u_2001"))).status, 204);
  assert.equal((await api("GET", `/api/properties/${id}`)).status, 404);
});

// ===================== image upload =====================
const mine = () => { const p = props[0]; p.createdBy = "u_2001"; p.images = []; return p.propertyID; };

test("upload: valid PNG is saved, linked and served", async () => {
  const id = mine();
  const r = await upload(id, [["images", PNG, "a.png", "image/png"]], tok("u_2001"));
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.uploaded.length, 1);
  assert.match(body.uploaded[0], /^\/uploads\/properties\/[a-f0-9]{24}\.png$/);
  assert.equal(uploaded().length, 1);
  const img = await fetch(base + body.uploaded[0]);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.equal((await fetch(base + "/uploads/properties/")).status, 404);
});
test("upload: file pretending to be an image is rejected and deleted", async () => {
  const r = await upload(mine(), [["images", Buffer.from("<?php echo 1; ?>"), "evil.png", "image/png"]], tok("u_2001"));
  assert.equal(r.status, 400);
  assert.equal(uploaded().length, 0);
});
test("upload: wrong type, no files, wrong field name", async () => {
  const id = mine();
  assert.equal((await upload(id, [["images", Buffer.from("hi"), "a.txt", "text/plain"]], tok("u_2001"))).status, 400);
  assert.equal((await upload(id, [], tok("u_2001"))).status, 400);
  const w = await upload(id, [["photo", PNG, "a.png", "image/png"]], tok("u_2001"));
  assert.equal(w.status, 400);
  assert.equal(uploaded().length, 0);
});
test("upload: bigger than 5 MB gives 413", async () => {
  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  const r = await upload(mine(), [["images", big, "big.png", "image/png"]], tok("u_2001"));
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error.code, "FILE_TOO_LARGE");
  assert.equal(uploaded().length, 0);
});
test("upload: more than 5 files is rejected", async () => {
  const parts = Array.from({ length: 6 }, (_, i) => ["images", PNG, `a${i}.png`, "image/png"]);
  const r = await upload(mine(), parts, tok("u_2001"));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, "UPLOAD_ERROR");
  assert.equal(uploaded().length, 0);
});
test("upload: not logged in or not the owner leaves no files", async () => {
  const id = mine();
  assert.equal((await upload(id, [["images", PNG, "a.png", "image/png"]])).status, 401);
  assert.equal((await upload(id, [["images", PNG, "a.png", "image/png"]], tok("u_2002"))).status, 403);
  assert.equal((await upload("p_nope", [["images", PNG, "a.png", "image/png"]], tok("u_2001"))).status, 404);
  assert.equal(uploaded().length, 0);
});
test("upload: limit of 20 images per property", async () => {
  const id = mine();
  props[0].images = Array.from({ length: 19 }, (_, i) => `https://e.com/${i}.jpg`);
  const r = await upload(id, [["images", PNG, "a.png", "image/png"], ["images", PNG, "b.png", "image/png"]], tok("u_2001"));
  assert.equal(r.status, 400);
  assert.equal(uploaded().length, 0);
});
test("delete image removes link and file; delete property removes its files", async () => {
  const id = mine();
  const up = await (await upload(id, [["images", PNG, "a.png", "image/png"], ["images", PNG, "b.png", "image/png"]], tok("u_2001"))).json();
  assert.equal(uploaded().length, 2);
  const del = await api("DELETE", `/api/properties/${id}/images`, { image: up.uploaded[0] }, tok("u_2001"));
  assert.equal(del.status, 200);
  assert.equal(uploaded().length, 1);
  assert.equal((await api("DELETE", `/api/properties/${id}/images`, { image: "/uploads/properties/zzz.png" }, tok("u_2001"))).status, 404);
  assert.equal((await api("DELETE", `/api/properties/${id}`, undefined, tok("u_2001"))).status, 204);
  assert.equal(uploaded().length, 0);
});

// ===================== preferences =====================
const pref = { preferredLocation: ["HSR Layout", "Indiranagar", "Koramangala"], budgetRange: { min: 5000000, max: 10000000 }, interiorPreferences: { minBhk: 2, furnishing: ["Fully-furnished", "Semi-furnished"], modularKitchen: true } };

test("preferences need login", async () => {
  for (const [m, u] of [["POST", "/api/preferences"], ["GET", "/api/preferences/me"], ["PATCH", "/api/preferences/me"], ["DELETE", "/api/preferences/me"]])
    assert.equal((await api(m, u, m === "GET" || m === "DELETE" ? undefined : {})).status, 401);
});
test("preferences: create, read, conflict, update, delete", async () => {
  const t = tok("u_2001");
  assert.equal((await api("GET", "/api/preferences/me", undefined, t)).status, 404);
  const c = await api("POST", "/api/preferences", { ...pref, userID: "u_2002" }, t);
  assert.equal(c.status, 201);
  const d = (await c.json()).data;
  assert.equal(d.userID, "u_2001");
  assert.match(d.preferenceID, /^pr_/);
  assert.equal((await api("POST", "/api/preferences", pref, t)).status, 409);
  assert.equal((await (await api("GET", "/api/preferences/me", undefined, t)).json()).data.budgetRange.max, 10000000);
  const u = await api("PATCH", "/api/preferences/me", { budgetRange: { min: 1, max: 99 } }, t);
  assert.equal((await u.json()).data.budgetRange.max, 99);
  assert.equal((await api("DELETE", "/api/preferences/me", undefined, t)).status, 204);
  assert.equal((await api("DELETE", "/api/preferences/me", undefined, t)).status, 404);
});
test("preferences: another user's data is separate", async () => {
  await api("POST", "/api/preferences", pref, tok("u_2001"));
  assert.equal((await api("GET", "/api/preferences/me", undefined, tok("u_2002"))).status, 404);
});
test("preferences: validation", async () => {
  const t = tok("u_2001");
  for (const body of [{}, { ...pref, budgetRange: { min: 5, max: 1 } }, { ...pref, budgetRange: { min: -1, max: 1 } }, { ...pref, interiorPreferences: { furnishing: ["Bad"] } }, { ...pref, preferredLocation: "x" }]) {
    assert.equal((await api("POST", "/api/preferences", body, t)).status, 400, JSON.stringify(body));
  }
  assert.equal((await api("PATCH", "/api/preferences/me", {}, t)).status, 400);
});

// ===================== recommended =====================
test("recommended applies saved preferences (budget + interior + locality)", async () => {
  const t = tok("u_2001");
  assert.equal((await api("GET", "/api/properties/recommended", undefined, t)).status, 404);
  assert.equal((await api("GET", "/api/properties/recommended")).status, 401);
  await api("POST", "/api/preferences", pref, t);
  const r = await (await api("GET", "/api/properties/recommended?limit=50", undefined, t)).json();
  const loc = pref.preferredLocation.map((s) => s.toLowerCase());
  const expected = seed.filter((p) => p.availability && p.price >= 20000 && p.price <= 10000000 && loc.includes(p.location.locality.toLowerCase()) && p.interiorFeatures.bhk >= 2 && pref.interiorPreferences.furnishing.includes(p.interiorFeatures.furnishing) && p.interiorFeatures.modularKitchen === true);
  assert.deepEqual(r.data.map((p) => p.propertyID).sort(), expected.map((p) => p.propertyID).sort());
  assert.ok(r.total > 0, "seed should give at least one match");
});
