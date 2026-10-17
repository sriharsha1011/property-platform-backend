const ApiError = require("../utils/ApiError");
const { verifyToken } = require("../utils/token");
const authService = require("../services/auth.service");

// Checks the "Authorization: Bearer <token>" header.
// If the token is good, the user is saved in req.user. Put it before any protected route.
module.exports = async function requireAuth(req, res, next) {
  const [type, token] = (req.headers.authorization || "").split(" ");
  if (type !== "Bearer" || !token) throw ApiError.unauthorized("Send the token as: Authorization: Bearer <token>");

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") throw ApiError.unauthorized("Token has expired. Please log in again", "TOKEN_EXPIRED");
    throw ApiError.unauthorized("Token is not valid", "INVALID_TOKEN");
  }

  if (await authService.isRevoked(payload.jti)) throw ApiError.unauthorized("You are logged out. Please log in again", "TOKEN_REVOKED");

  const user = await authService.findByID(payload.sub);
  if (!user) throw ApiError.unauthorized("This user no longer exists");

  req.user = user;
  req.token = { jti: payload.jti, exp: payload.exp };
  next();
};
