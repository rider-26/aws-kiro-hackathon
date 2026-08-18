const dashboardService = require('../services/dashboardService');
const { ok } = require('../utils/response');

/**
 * Single dashboard endpoint that branches on the caller's role, so each role
 * gets exactly its own data and never another role's.
 */
async function getDashboard(req, res, next) {
  try {
    if (req.user.role === 'Tutor') {
      return ok(res, await dashboardService.getTutorDashboard(req.user.id));
    }
    return ok(res, await dashboardService.getTuteeDashboard(req.user.id));
  } catch (err) {
    return next(err);
  }
}

module.exports = { getDashboard };
