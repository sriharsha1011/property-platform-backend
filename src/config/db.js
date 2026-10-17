const mongoose = require("mongoose");
const env = require("./env");

// If the database is not connected, fail right away instead of waiting
mongoose.set("bufferCommands", false);

async function connectDB() {
  await mongoose.connect(env.mongoUri, { dbName: env.dbName, serverSelectionTimeoutMS: 5000 });
  console.log(`MongoDB connected: ${env.dbName}`);
}

const isConnected = () => mongoose.connection.readyState === 1;

module.exports = { connectDB, isConnected };
