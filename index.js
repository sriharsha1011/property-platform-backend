// Entry point: connects to MongoDB, then starts the Express server
const env = require("./src/config/env");
const app = require("./src/app");
const { connectDB } = require("./src/config/db");
const mongoose = require("mongoose");

async function start() {
  if (!env.jwtSecret || env.jwtSecret.length < 16) {
    console.error("JWT_SECRET is missing or too short. Set it in the .env file (16+ characters).");
    process.exit(1);
  }
  try {
    await connectDB();
  } catch (err) {
    console.error(`Could not connect to MongoDB at ${env.mongoUri}`);
    console.error(`Reason: ${err.message}`);
    console.error("Check that the MongoDB service is running and MONGODB_URI in .env is correct.");
    process.exit(1);
  }
  const server = app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
    console.log(`Health check:   http://localhost:${env.port}/api/health`);
  });

  const stop = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

start();
