const router = require("express").Router();
const requireDb = require("../middleware/requireDb");
const requireAuth = require("../middleware/auth");
const validate = require("../middleware/validate");
const v = require("../validators/preference.validator");
const c = require("../controllers/preference.controller");

router.use(requireDb, requireAuth);

router.post("/", validate(v.create), c.create);
router.get("/me", c.getMine);
router.patch("/me", validate(v.update), c.updateMine);
router.delete("/me", c.deleteMine);

module.exports = router;
