const progressService = require('../services/progressService');
const { ok } = require('../utils/response');

async function getOwnProgress(req, res, next) {
  try {
    const progress = await progressService.getProgress(req.user.id, { moduleId: req.query.moduleId });
    return ok(res, progress);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getOwnProgress };
