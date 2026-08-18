const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const idGen = require('../utils/idGen');
const userRepository = require('../repositories/userRepository');
const { ApiError } = require('../middleware/errorHandler');

const SALT_ROUNDS = 10;
const ALLOWED_SELF_REGISTER_ROLE = 'Tutee';
const VALID_ROLES = ['Tutee', 'Tutor', 'Admin'];

/**
 * Email format check.
 *
 * Requires a dot-separated domain, which is stricter than the HTML5 `type=email`
 * the browser applies — that accepts `wyt@123`, since a dotless domain is
 * technically legal in the spec. Email is the login identifier here and has to
 * be unique, so letting a malformed value through creates an account nobody can
 * be contacted at and that the owner may not be able to type the same way twice.
 *
 * Deliberately NOT restricted to an nyp.edu.sg domain: the seeded demo accounts
 * use @student.demo / @tutor.demo / @admin.demo, and hard-coding an institutional
 * domain would break them and any future partner institution. Verifying that
 * someone genuinely owns an address is a job for an email confirmation flow, not
 * a regex.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 practical limit.

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function assertValidEmail(email) {
  if (email.length > MAX_EMAIL_LENGTH) {
    throw new ApiError(400, 'That email address is too long');
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, 'Enter a valid email address, for example name@student.nyp.edu.sg');
  }
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Registers a new user. Per spec, self-registration is only available to
 * Tutees — Tutor and Admin accounts are seeded/created administratively, not
 * self-served, so this never accepts a role other than Tutee even if one is
 * passed in the request body.
 */
async function register({ full_name, email, password, course, year_of_study }) {
  if (!full_name || !email || !password) {
    throw new ApiError(400, 'full_name, email and password are required');
  }

  const cleanEmail = normalizeEmail(email);
  assertValidEmail(cleanEmail);

  const cleanName = String(full_name).trim();
  if (!cleanName) {
    throw new ApiError(400, 'Enter your full name');
  }

  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  const existing = await userRepository.getByEmail(cleanEmail);
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await userRepository.create({
    id: idGen('user'),
    full_name: cleanName,
    email: cleanEmail,
    password_hash,
    role: ALLOWED_SELF_REGISTER_ROLE,
    course: course || '',
    year_of_study: year_of_study || '',
    profile_image: '',
    account_status: 'Active',
    // Learning data is private by default (business rule 9 / spec section 18).
    share_learning_summary: false,
    created_date: new Date().toISOString(),
  });

  const token = issueToken(user);
  return { user, token };
}

async function login({ email, password }) {
  if (!email || !password) {
    throw new ApiError(400, 'email and password are required');
  }

  const user = await userRepository.getByEmail(email);
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash || '');
  if (!valid) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.account_status === 'Suspended') {
    throw new ApiError(403, 'This account has been suspended. Contact an administrator.');
  }

  const token = issueToken(user);
  return { user, token };
}

/**
 * Used only by the seed script to create the 3 demo accounts (Tutee/Tutor/Admin)
 * bypassing the "Tutee only" self-registration restriction, since seeding is an
 * administrative/dev-time operation, not a public endpoint.
 */
async function createSeedUser({ full_name, email, password, role, course, year_of_study }) {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role for seed user: ${role}`);
  }
  const existing = await userRepository.getByEmail(email);
  if (existing) {
    return existing;
  }
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  return userRepository.create({
    id: idGen('user'),
    full_name,
    email,
    password_hash,
    role,
    course: course || '',
    year_of_study: year_of_study || '',
    profile_image: '',
    account_status: 'Active',
    // Off by default here too; the demo flow turns it on explicitly.
    share_learning_summary: false,
    created_date: new Date().toISOString(),
  });
}

module.exports = { register, login, issueToken, createSeedUser };
