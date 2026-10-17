const { Schema, model } = require("mongoose");
const { FURNISHING } = require("./Property");

const budgetSchema = new Schema(
  {
    min: { type: Number, required: true, min: 0 },
    max: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);
budgetSchema.path("max").validate(function (max) {
  return max >= this.min;
}, "max must not be less than min");

const interiorPrefSchema = new Schema(
  {
    flooringType: { type: [String], default: undefined },
    minBhk: { type: Number, min: 1, max: 20, validate: Number.isInteger },
    furnishing: { type: [{ type: String, enum: FURNISHING }], default: undefined },
    style: { type: [String], default: undefined },
    modularKitchen: { type: Boolean },
  },
  { _id: false }
);

const preferenceSchema = new Schema(
  {
    preferenceID: { type: String, required: true },
    userID: { type: String, required: true, unique: true },
    preferredLocation: { type: [String], default: [] },
    budgetRange: { type: budgetSchema, required: true },
    interiorPreferences: { type: interiorPrefSchema },
  },
  { collection: "userPreferences", versionKey: false, autoIndex: false }
);

module.exports = model("UserPreference", preferenceSchema);
