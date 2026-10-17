const mongoose = require("mongoose");

const STATES = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

exports.getHealth = (req, res) => {
  res.json({
    status: "ok",
    database: STATES[mongoose.connection.readyState],
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
};
