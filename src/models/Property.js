const { Schema, model } = require("mongoose");

const FURNISHING = ["Unfurnished", "Semi-furnished", "Fully-furnished"];

const locationSchema = new Schema(
  {
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    locality: { type: String, required: true, trim: true },
    pincode: { type: String, match: /^\d{6}$/ },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
  },
  { _id: false }
);

const roomSchema = new Schema(
  {
    type: { type: String, required: true },
    lengthFt: { type: Number, required: true, min: 1 },
    widthFt: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const interiorSchema = new Schema(
  {
    bhk: { type: Number, required: true, min: 1, max: 20, validate: Number.isInteger },
    flooringType: { type: String, required: true, trim: true },
    furnishing: { type: String, required: true, enum: FURNISHING },
    style: { type: String, trim: true },
    modularKitchen: { type: Boolean, default: false },
    areaSqFt: { type: Number, required: true, min: 1 },
    rooms: { type: [roomSchema], default: undefined },
  },
  { _id: false }
);

const propertySchema = new Schema(
  {
    propertyID: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    location: { type: locationSchema, required: true },
    price: { type: Number, required: true, min: 0 },
    interiorFeatures: { type: interiorSchema, required: true },
    images: { type: [String], default: [] },
    availability: { type: Boolean, default: true },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  // Uses the existing "properties" collection made by the seed script.
  // Indexes are created by the seed script, so autoIndex is off here.
  { collection: "properties", versionKey: false, autoIndex: false }
);

module.exports = model("Property", propertySchema);
module.exports.FURNISHING = FURNISHING;
