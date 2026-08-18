/**
 * Strips server-only fields (password hash) before a user object is ever
 * sent to the client. Used on every response that includes a user record.
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

module.exports = { sanitizeUser };
