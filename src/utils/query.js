const ApiError = require("./ApiError");
const { FURNISHING } = require("../models/Property");

// "a, b" or ["a","b"] -> ["a","b"]
const csv = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((s) => String(s).trim()).filter(Boolean);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Matches any of the words, ignoring upper/lower case
const anyOf = (list) => ({ $regex: `^(?:${list.map(escapeRegex).join("|")})$`, $options: "i" });

function num(q, key, errors, { int = false, min = -Infinity } = {}) {
  if (q[key] === undefined || q[key] === "") return undefined;
  const n = Number(q[key]);
  if (!Number.isFinite(n) || n < min || (int && !Number.isInteger(n))) {
    errors.push({ field: key, message: int ? `must be a whole number${min > -Infinity ? ` (${min} or more)` : ""}` : "must be a number, 0 or more" });
    return undefined;
  }
  return n;
}
function bool(q, key, errors) {
  if (q[key] === undefined || q[key] === "") return undefined;
  if (q[key] === "true") return true;
  if (q[key] === "false") return false;
  errors.push({ field: key, message: "must be true or false" });
  return undefined;
}
function furnishingList(q, key, errors) {
  const out = [];
  for (const item of csv(q[key])) {
    const match = FURNISHING.find((f) => f.toLowerCase() === item.toLowerCase());
    if (!match) errors.push({ field: key, message: `"${item}" is not valid. Use: ${FURNISHING.join(", ")}` });
    else out.push(match);
  }
  return out;
}
function parsePaging(q) {
  const errors = [];
  const page = num(q, "page", errors, { int: true, min: 1 }) ?? 1;
  const limit = num(q, "limit", errors, { int: true, min: 1 }) ?? 10;
  if (limit > 50) errors.push({ field: "limit", message: "must be 50 or less" });
  if (errors.length) throw ApiError.badRequest("Invalid paging values", errors);
  return { page, limit };
}

module.exports = { csv, anyOf, num, bool, furnishingList, parsePaging };
