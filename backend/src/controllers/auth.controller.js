const authService = require('../services/authService');
const userRepository = require('../repositories/userRepository');
const { sanitizeUser } = require('../utils/sanitize');
const { ok, created } = require('../utils/response');
const { ApiError } = require('../middleware/errorHandler');

async function register(req, res, next) {
  try {
    const { user, token } = await authService.register(req.body);
    return created(res, { user: sanitizeUser(user), token });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body);
    return ok(res, { user: sanitizeUser(user), token });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await userRepository.getById(req.user.id);
    if (!user) return next(new ApiError(404, 'User not found'));
    return ok(res, { user: sanitizeUser(user) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, me };
