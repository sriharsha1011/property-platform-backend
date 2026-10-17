// All database work for properties lives here. Controllers call these functions.
const { Property } = require("../models");

const noId = "-_id";

exports.list = async (filter, sort, skip, limit) => {
  const [data, total] = await Promise.all([
    Property.find(filter).select(noId).sort(sort).skip(skip).limit(limit).lean(),
    Property.countDocuments(filter),
  ]);
  return { data, total };
};

exports.findByID = (propertyID) => Property.findOne({ propertyID }).select(noId).lean();

exports.create = async (data) => {
  const doc = await Property.create(data);
  const { _id, ...rest } = doc.toObject();
  return rest;
};

exports.update = (propertyID, changes) =>
  Property.findOneAndUpdate({ propertyID }, { $set: changes }, { returnDocument: "after", runValidators: true }).select(noId).lean();

exports.remove = (propertyID) => Property.deleteOne({ propertyID });

exports.addImages = (propertyID, urls) =>
  Property.findOneAndUpdate({ propertyID }, { $push: { images: { $each: urls } } }, { returnDocument: "after" }).select(noId).lean();

exports.removeImage = (propertyID, url) =>
  Property.findOneAndUpdate({ propertyID }, { $pull: { images: url } }, { returnDocument: "after" }).select(noId).lean();

// Used by search: the cheapest `limit` properties that pass the filter. They are ranked in the app.
exports.candidates = (filter, limit) => Property.find(filter).select(noId).sort({ price: 1, propertyID: 1 }).limit(limit).lean();
