const { FURNISHING } = require("../models/Property");

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v, min = 1, max = 200) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isHttpUrl = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

// Validates property data. partial=true is for updates: every field is optional,
// but a nested object (location, interiorFeatures) must be sent whole.
function validateProperty(body, { partial = false } = {}) {
  const errors = [];
  const out = {};
  const add = (field, message) => errors.push({ field, message });
  if (!isObj(body)) return { errors: [{ field: "body", message: "Send a JSON object" }] };
  const has = (k) => body[k] !== undefined;
  const need = (k) => {
    if (!has(k) && !partial) add(k, "is required");
    return has(k);
  };

  if (need("name")) {
    if (!isStr(body.name, 1, 150)) add("name", "must be text, 1 to 150 characters");
    else out.name = body.name.trim();
  }

  if (need("location")) {
    const l = body.location;
    if (!isObj(l)) add("location", "must be an object");
    else {
      const loc = {};
      for (const k of ["address", "city", "locality"]) {
        if (!isStr(l[k])) add(`location.${k}`, "is required and must be text");
        else loc[k] = l[k].trim();
      }
      if (l.pincode !== undefined) {
        if (!/^\d{6}$/.test(String(l.pincode))) add("location.pincode", "must be 6 digits");
        else loc.pincode = String(l.pincode);
      }
      if (l.latitude !== undefined) {
        if (!isNum(l.latitude) || l.latitude < -90 || l.latitude > 90) add("location.latitude", "must be a number from -90 to 90");
        else loc.latitude = l.latitude;
      }
      if (l.longitude !== undefined) {
        if (!isNum(l.longitude) || l.longitude < -180 || l.longitude > 180) add("location.longitude", "must be a number from -180 to 180");
        else loc.longitude = l.longitude;
      }
      out.location = loc;
    }
  }

  if (need("price")) {
    if (!isNum(body.price) || body.price < 0) add("price", "must be a number, 0 or more");
    else out.price = body.price;
  }

  if (need("interiorFeatures")) {
    const f = body.interiorFeatures;
    if (!isObj(f)) add("interiorFeatures", "must be an object");
    else {
      const feat = {};
      if (!Number.isInteger(f.bhk) || f.bhk < 1 || f.bhk > 20) add("interiorFeatures.bhk", "must be a whole number from 1 to 20");
      else feat.bhk = f.bhk;
      if (!isStr(f.flooringType, 1, 50)) add("interiorFeatures.flooringType", "is required and must be text");
      else feat.flooringType = f.flooringType.trim();
      if (!FURNISHING.includes(f.furnishing)) add("interiorFeatures.furnishing", `must be one of: ${FURNISHING.join(", ")}`);
      else feat.furnishing = f.furnishing;
      if (!isNum(f.areaSqFt) || f.areaSqFt <= 0) add("interiorFeatures.areaSqFt", "must be a number more than 0");
      else feat.areaSqFt = f.areaSqFt;
      if (f.style !== undefined) {
        if (!isStr(f.style, 1, 50)) add("interiorFeatures.style", "must be text");
        else feat.style = f.style.trim();
      }
      if (f.modularKitchen !== undefined) {
        if (typeof f.modularKitchen !== "boolean") add("interiorFeatures.modularKitchen", "must be true or false");
        else feat.modularKitchen = f.modularKitchen;
      }
      if (f.rooms !== undefined) {
        const okRooms =
          Array.isArray(f.rooms) &&
          f.rooms.length <= 50 &&
          f.rooms.every((r) => isObj(r) && isStr(r.type, 1, 50) && isNum(r.lengthFt) && r.lengthFt > 0 && isNum(r.widthFt) && r.widthFt > 0);
        if (!okRooms) add("interiorFeatures.rooms", "must be a list of { type, lengthFt, widthFt }");
        else feat.rooms = f.rooms.map((r) => ({ type: r.type.trim(), lengthFt: r.lengthFt, widthFt: r.widthFt }));
      }
      out.interiorFeatures = feat;
    }
  }

  // Only outside links are allowed here. Photos from your computer go through the upload endpoint.
  if (has("images")) {
    if (!Array.isArray(body.images) || body.images.length > 20 || !body.images.every(isHttpUrl))
      add("images", "must be a list (max 20) of http or https links. To upload files, use POST /api/properties/:propertyID/images");
    else out.images = body.images;
  }

  if (has("availability")) {
    if (typeof body.availability !== "boolean") add("availability", "must be true or false");
    else out.availability = body.availability;
  }

  if (partial && errors.length === 0 && Object.keys(out).length === 0) add("body", "Send at least one field to update");
  return { errors, value: out };
}

module.exports = {
  create: (body) => validateProperty(body),
  update: (body) => validateProperty(body, { partial: true }),
  removeImage(body) {
    if (!isObj(body) || typeof body.image !== "string" || !body.image) return { errors: [{ field: "image", message: "send the image link to remove" }] };
    return { errors: [], value: { image: body.image } };
  },
};
