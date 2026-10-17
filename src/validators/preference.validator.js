const { FURNISHING } = require("../models/Property");

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 100;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const stringList = (v) => Array.isArray(v) && v.length <= 50 && v.every(isStr);

// partial=true is for updates: each field is optional, and a field that is sent replaces the old one
function validatePreferences(body, { partial = false } = {}) {
  const errors = [];
  const out = {};
  const add = (field, message) => errors.push({ field, message });
  if (!isObj(body)) return { errors: [{ field: "body", message: "Send a JSON object" }] };
  const has = (k) => body[k] !== undefined;

  if (has("preferredLocation")) {
    if (!stringList(body.preferredLocation)) add("preferredLocation", "must be a list of area names");
    else out.preferredLocation = body.preferredLocation.map((s) => s.trim());
  } else if (!partial) add("preferredLocation", "is required: a list of area names");

  if (has("budgetRange")) {
    const b = body.budgetRange;
    if (!isObj(b) || !isNum(b.min) || !isNum(b.max) || b.min < 0 || b.max < 0) add("budgetRange", "must be { min, max } with numbers 0 or more");
    else if (b.min > b.max) add("budgetRange", "min must not be more than max");
    else out.budgetRange = { min: b.min, max: b.max };
  } else if (!partial) add("budgetRange", "is required: { min, max }");

  if (has("interiorPreferences")) {
    const p = body.interiorPreferences;
    if (!isObj(p)) add("interiorPreferences", "must be an object");
    else {
      const ip = {};
      for (const k of ["flooringType", "style"]) {
        if (p[k] !== undefined) {
          if (!stringList(p[k])) add(`interiorPreferences.${k}`, "must be a list of text");
          else ip[k] = p[k].map((s) => s.trim());
        }
      }
      if (p.furnishing !== undefined) {
        if (!Array.isArray(p.furnishing) || !p.furnishing.every((x) => FURNISHING.includes(x)))
          add("interiorPreferences.furnishing", `must be a list of: ${FURNISHING.join(", ")}`);
        else ip.furnishing = p.furnishing;
      }
      if (p.minBhk !== undefined) {
        if (!Number.isInteger(p.minBhk) || p.minBhk < 1 || p.minBhk > 20) add("interiorPreferences.minBhk", "must be a whole number from 1 to 20");
        else ip.minBhk = p.minBhk;
      }
      if (p.modularKitchen !== undefined) {
        if (typeof p.modularKitchen !== "boolean") add("interiorPreferences.modularKitchen", "must be true or false");
        else ip.modularKitchen = p.modularKitchen;
      }
      out.interiorPreferences = ip;
    }
  }

  if (partial && errors.length === 0 && Object.keys(out).length === 0) add("body", "Send at least one field to update");
  return { errors, value: out };
}

module.exports = {
  create: (body) => validatePreferences(body),
  update: (body) => validatePreferences(body, { partial: true }),
};
