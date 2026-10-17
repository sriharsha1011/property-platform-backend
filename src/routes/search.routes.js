const router = require("express").Router();
const requireDb = require("../middleware/requireDb");
const requireAuth = require("../middleware/auth");
const { search } = require("../controllers/search.controller");

// Login is needed only when the search uses saved preferences
const authIfPreferences = (req, res, next) => (req.query.usePreferences === "true" ? requireAuth(req, res, next) : next());

router.get("/", requireDb, authIfPreferences, search);

module.exports = router;
