// Run with: npm test   (no database needed: the database layer is replaced by a small in-memory fake)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_secret_for_unit_tests_only";

const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = require("../src/app");
const db = require("../src/config/db");
const authService = require("../src/services/auth.service");

let server, base;
let users, revoked;

before(async () => {
  mock.method(db, "isConnected", () => true);
  mock.method(authService, "findByEmailOrUsername", async ({ email, username }) =>
    users.find((u) => (email && u.email === email) || (username && u.username === username)) || null);
  mock.method(authService, "findByID", async (id) => {
    const u = users.find((x) => x.userID === id);
    if (!u) return null;
    const { passwordHash, ...safe } = u; // like the real query: no hash
    return safe;
  });
  mock.method(authService, "createUser", async (data) => {
    const doc = { ...data, dateJoined: new Date() };
    users.push(doc);
    const { passwordHash, ...safe } = doc;
    return safe;
  });
  mock.method(authService, "isRevoked", async (jti) => revoked.has(jti));
  mock.method(authService, "revoke", async (jti) => revoked.add(jti));

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});
after(() => server.close());
beforeEach(() => {
  revoked = new Set();
  users = [{
    userID: "u_2001", username: "harsha_10", email: "harsha@example.com", dateJoined: new Date("2026-10-12"),
    passwordHash: bcrypt.hashSync("Test@1234", 4),
  }];
});

const post = (path, body, token) =>
  fetch(`${base}/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (path, token) => fetch(`${base}/api/auth${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const login = async () => (await (await post("/login", { email: "harsha@example.com", password: "Test@1234" })).json()).token;

// ---------- signup ----------
test("signup rejects bad values and lists each problem", async () => {
  const res = await post("/signup", { username: "a b", email: "nope", password: "short" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.deepEqual(body.error.details.map((d) => d.field).sort(), ["email", "password", "username"]);
});

test("signup rejects a password with no number", async () => {
  const res = await post("/signup", { username: "newuser", email: "n@example.com", password: "onlyletters" });
  assert.equal(res.status, 400);
});

test("signup creates the user, returns a token and never returns the password hash", async () => {
  const res = await post("/signup", { username: "new_user", email: "New@Example.com", password: "Passw0rd123" });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.token);
  assert.equal(body.user.email, "new@example.com"); // saved in lower case
  assert.equal(body.user.passwordHash, undefined);
  const saved = users.find((u) => u.username === "new_user");
  assert.notEqual(saved.passwordHash, "Passw0rd123"); // only the hash is saved
  assert.ok(await bcrypt.compare("Passw0rd123", saved.passwordHash));
});

test("signup with a used email or username gives 409", async () => {
  let res = await post("/signup", { username: "other_name", email: "harsha@example.com", password: "Passw0rd123" });
  assert.equal(res.status, 409);
  res = await post("/signup", { username: "harsha_10", email: "other@example.com", password: "Passw0rd123" });
  assert.equal(res.status, 409);
});

test("signup with broken JSON gives 400 INVALID_JSON", async () => {
  const res = await post("/signup", "{oops");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "INVALID_JSON");
});

// ---------- login ----------
test("login works with email and with username", async () => {
  let res = await post("/login", { email: "HARSHA@example.com", password: "Test@1234" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.token);
  assert.equal(body.user.userID, "u_2001");
  assert.equal(body.user.passwordHash, undefined);
  res = await post("/login", { username: "harsha_10", password: "Test@1234" });
  assert.equal(res.status, 200);
});

test("login with a wrong password or unknown user gives the same 401 message", async () => {
  const a = await post("/login", { email: "harsha@example.com", password: "Wrong@1234" });
  const b = await post("/login", { email: "nobody@example.com", password: "Test@1234" });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  const [ba, bb] = [await a.json(), await b.json()];
  assert.equal(ba.error.code, "INVALID_CREDENTIALS");
  assert.equal(ba.error.message, bb.error.message);
});

test("login without a password gives 400", async () => {
  const res = await post("/login", { email: "harsha@example.com" });
  assert.equal(res.status, 400);
});

// ---------- token checks (middleware) ----------
test("token contents: user ID, unique id and an expiry date", async () => {
  const payload = jwt.decode(await login());
  assert.equal(payload.sub, "u_2001");
  assert.ok(payload.jti);
  assert.ok(payload.exp > payload.iat);
});

test("/me works with a good token", async () => {
  const res = await get("/me", await login());
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.username, "harsha_10");
});

test("/me without a token gives 401", async () => {
  const res = await get("/me");
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "UNAUTHORIZED");
});

test("/me with a made-up, changed or 'none' token gives INVALID_TOKEN", async () => {
  const wrongSecret = jwt.sign({}, "some_other_secret", { subject: "u_2001", jwtid: "x", expiresIn: "1h" });
  const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from('{"sub":"u_2001"}').toString("base64url")}.`;
  for (const t of ["garbage", wrongSecret, noneAlg]) {
    const res = await get("/me", t);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "INVALID_TOKEN");
  }
});

test("/me with an expired token gives TOKEN_EXPIRED", async () => {
  const expired = jwt.sign({}, process.env.JWT_SECRET, { subject: "u_2001", jwtid: "e1", expiresIn: -10 });
  const res = await get("/me", expired);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "TOKEN_EXPIRED");
});

test("a token for a user that was deleted gives 401", async () => {
  const token = await login();
  users = [];
  const res = await get("/me", token);
  assert.equal(res.status, 401);
});

// ---------- logout ----------
test("logout cancels the token, but a new login still works", async () => {
  const token = await login();
  let res = await post("/logout", {}, token);
  assert.equal(res.status, 200);
  res = await get("/me", token);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "TOKEN_REVOKED");
  res = await get("/me", await login());
  assert.equal(res.status, 200);
});

test("logout without a token gives 401", async () => {
  const res = await post("/logout", {});
  assert.equal(res.status, 401);
});
