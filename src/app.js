// Builds the Express app (no server start here, so it is easy to test)
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/error");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "100kb" }));
if (env.nodeEnv !== "test") app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({ name: "Property Platform API", version: "1.0.0", health: "/api/health" });
});
// Sample photos that come with the project (see scripts/seed.js)
app.use("/uploads/seed", express.static(path.join(__dirname, "..", "seed-images"), { index: false, dotfiles: "ignore" }));
// Uploaded images are public files. No folder listing, no hidden files.
app.use(
  "/uploads",
  express.static(env.uploadDir, {
    index: false,
    dotfiles: "ignore",
    setHeaders: (res) => res.set("Cross-Origin-Resource-Policy", "cross-origin"),
  })
);
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
