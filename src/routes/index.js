const router = require("express").Router();

// Each feature gets its own route file. New ones are added here.
router.use("/health", require("./health.routes"));
router.use("/auth", require("./auth.routes"));
router.use("/properties", require("./property.routes"));
router.use("/preferences", require("./preference.routes"));
router.use("/locations", require("./location.routes"));
router.use("/search", require("./search.routes"));

module.exports = router;
