// An error we throw on purpose, with an HTTP status and a short code
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(message, details) { return new ApiError(400, "VALIDATION_ERROR", message, details); }
  static unauthorized(message = "Login needed", code = "UNAUTHORIZED") { return new ApiError(401, code, message); }
  static forbidden(message = "You are not allowed to do this") { return new ApiError(403, "FORBIDDEN", message); }
  static notFound(message = "Not found", code = "NOT_FOUND") { return new ApiError(404, code, message); }
  static conflict(message) { return new ApiError(409, "CONFLICT", message); }
}
module.exports = ApiError;
