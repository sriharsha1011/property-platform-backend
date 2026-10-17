const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Each validator returns { errors, value }. "value" is the cleaned data.
function signup(body) {
  const errors = [];
  if (!isObj(body)) return { errors: [{ field: "body", message: "Send a JSON object" }] };
  const { username, email, password } = body;

  if (typeof username !== "string" || !/^[A-Za-z0-9_]{3,30}$/.test(username.trim()))
    errors.push({ field: "username", message: "must be 3 to 30 letters, numbers or underscore (_)" });
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    errors.push({ field: "email", message: "must be a valid email" });
  if (typeof password !== "string" || password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    errors.push({ field: "password", message: "must be 8 to 72 characters with at least one letter and one number" });

  if (errors.length) return { errors };
  return { errors, value: { username: username.trim(), email: email.trim().toLowerCase(), password } };
}

function login(body) {
  const errors = [];
  if (!isObj(body)) return { errors: [{ field: "body", message: "Send a JSON object" }] };
  const { email, username, password } = body;

  if (typeof email !== "string" && typeof username !== "string") errors.push({ field: "email", message: "send your email (or username)" });
  if (typeof password !== "string" || password.length === 0) errors.push({ field: "password", message: "is required" });

  if (errors.length) return { errors };
  const value = { password };
  if (typeof email === "string") value.email = email.trim().toLowerCase();
  else value.username = username.trim();
  return { errors, value };
}

module.exports = { signup, login };
