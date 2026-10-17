const ApiError = require("../utils/ApiError");

// Use in a route:  router.post("/signup", validate(validators.signup), controller)
// The cleaned data is then in req.valid
module.exports = (validator) => (req, res, next) => {
  const { errors, value } = validator(req.body);
  if (errors.length) return next(ApiError.badRequest("Some values are not valid", errors));
  req.valid = value;
  next();
};
