const router = require("express").Router();
const requireDb = require("../middleware/requireDb");
const c = require("../controllers/location.controller");

router.get("/suggest", requireDb, c.suggest);

module.exports = router;
