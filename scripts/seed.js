// Loads sample homes into MongoDB:  npm run seed
// Safe to run again and again: a home that already exists (same propertyID) is updated, not copied.
// createdAt is filled in by the Property model (default) the first time a home is inserted.
// Homes are in many Indian cities and each one has 4 photos (pictures are served from /uploads/seed).
const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");
const { Property } = require("../src/models");
const homes = require("./seedHomes.json");

(async () => {
  await connectDB();
  for (const h of homes) {
    await Property.updateOne({ propertyID: h.propertyID }, { $set: h }, { upsert: true });
  }
  // helps the search and the location box
  await Property.collection.createIndex({ "location.city": 1, "location.locality": 1 });
  await Property.collection.createIndex({ price: 1 });
  console.log(`Done. ${homes.length} homes saved, in ${new Set(homes.map((h) => h.location.city)).size} cities.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
