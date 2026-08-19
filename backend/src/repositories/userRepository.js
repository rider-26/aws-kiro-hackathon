const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.users);

/**
 * Data-access layer for the Users table.
 *
 * Email must be unique but isn't the partition key, so lookups by email go
 * through the `email-index` secondary index. Emails are lower-cased on write
 * and on lookup so sign-in is case-insensitive — that normalisation lives here
 * rather than in authService so no caller can accidentally bypass it.
 */

/** Trim as well as lower-case: a trailing space pasted into a login form
 *  shouldn't look like a different account. */
function normalize(email) {
  return String(email || '').trim().toLowerCase();
}

async function getByEmail(email) {
  if (!email) return null;
  const items = await base.queryByIndex('email-index', 'email = :email', {
    ':email': normalize(email),
  });
  return items[0] || null;
}

async function create(user) {
  return base.create({ ...user, email: normalize(user.email) });
}

module.exports = { ...base, getByEmail, create };
