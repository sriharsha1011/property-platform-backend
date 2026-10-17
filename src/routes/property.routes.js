const router = require("express").Router();
const requireDb = require("../middleware/requireDb");
const requireAuth = require("../middleware/auth");
const validate = require("../middleware/validate");
const v = require("../validators/property.validator");
const c = require("../controllers/property.controller");
const { uploadImages, checkImages } = require("../middleware/upload");

router.use(requireDb);

router.get("/", c.listProperties);
router.get("/recommended", requireAuth, c.recommended); // must stay above "/:propertyID"
router.post("/", requireAuth, validate(v.create), c.createProperty);
router.get("/:propertyID", c.getProperty);
router.patch("/:propertyID", requireAuth, validate(v.update), c.updateProperty);
router.delete("/:propertyID", requireAuth, c.deleteProperty);

// Owner check runs BEFORE multer, so a stranger's files are never written to disk
const ownerOnly = async (req, res, next) => {
  req.property = await c.loadOwned(req);
  next();
};
router.post("/:propertyID/images", requireAuth, ownerOnly, uploadImages, checkImages, c.uploadImages);
router.delete("/:propertyID/images", requireAuth, ownerOnly, validate(v.removeImage), c.deleteImage);

module.exports = router;
