const router = require("express").Router();
const requireDb = require("../middleware/requireDb");
const requireAuth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimit");
const validators = require("../validators/auth.validator");
const auth = require("../controllers/auth.controller");

router.use(requireDb);

router.post("/signup", authLimiter, validate(validators.signup), auth.signup);
router.post("/login", authLimiter, validate(validators.login), auth.login);
router.post("/logout", requireAuth, auth.logout);
router.get("/me", requireAuth, auth.me);

module.exports = router;
