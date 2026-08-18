const verificationService = require('../services/verificationService');
const recognitionService = require('../services/recognitionService');
const reportService = require('../services/reportService');
const adminService = require('../services/adminService');
const { ok } = require('../utils/response');

// --- Verification queue (business rule 12) ----------------------------------

async function listVerifications(req, res, next) {
  try {
    const { verifications, counts } = await verificationService.listForAdmin({ status: req.query.status });
    return ok(res, { verifications, counts, statuses: verificationService.VALID_STATUSES });
  } catch (err) {
    return next(err);
  }
}

async function decideVerification(req, res, next) {
  try {
    const { status, admin_notes } = req.body;
    const updated = await verificationService.setStatus(req.params.id, {
      status,
      adminId: req.user.id,
      admin_notes,
    });
    return ok(res, { verification: await verificationService.hydrate(updated) });
  } catch (err) {
    return next(err);
  }
}

// --- Recognition thresholds (spec section 22) -------------------------------

async function getRecognitionRules(req, res, next) {
  try {
    const rules = await recognitionService.getRules();
    return ok(res, { rules });
  } catch (err) {
    return next(err);
  }
}

async function updateRecognitionRules(req, res, next) {
  try {
    const rules = await recognitionService.updateRules(req.user.id, req.body);
    return ok(res, { rules });
  } catch (err) {
    return next(err);
  }
}

// --- Moderation queue (spec section 26) ------------------------------------

async function listReports(req, res, next) {
  try {
    const { reports, counts } = await reportService.listForAdmin({ status: req.query.status });
    return ok(res, { reports, counts, actions: reportService.ADMIN_ACTIONS, statuses: reportService.REPORT_STATUSES });
  } catch (err) {
    return next(err);
  }
}

async function getReport(req, res, next) {
  try {
    const report = await reportService.getForAdmin(req.params.id);
    return ok(res, { report });
  } catch (err) {
    return next(err);
  }
}

async function actionReport(req, res, next) {
  try {
    const result = await reportService.applyAdminAction(req.user.id, req.params.id, req.body);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

async function reinstateUser(req, res, next) {
  try {
    const user = await reportService.reinstateUser(req.user.id, req.params.userId);
    return ok(res, { user });
  } catch (err) {
    return next(err);
  }
}

// --- Oversight views (spec sections 23, 24, 27) ----------------------------

async function getDashboard(req, res, next) {
  try {
    const dashboard = await adminService.getDashboard();
    return ok(res, dashboard);
  } catch (err) {
    return next(err);
  }
}

async function listStudents(req, res, next) {
  try {
    const students = await adminService.listStudents({ search: req.query.search });
    return ok(res, { students });
  } catch (err) {
    return next(err);
  }
}

async function listTutors(req, res, next) {
  try {
    const tutors = await adminService.listTutors({ search: req.query.search });
    return ok(res, { tutors });
  } catch (err) {
    return next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const sessions = await adminService.listSessions({
      status: req.query.status,
      moduleId: req.query.moduleId,
    });
    return ok(res, { sessions });
  } catch (err) {
    return next(err);
  }
}

async function getAnalytics(req, res, next) {
  try {
    const analytics = await adminService.getAnalytics();
    return ok(res, analytics);
  } catch (err) {
    return next(err);
  }
}

async function getUserDetail(req, res, next) {
  try {
    const detail = await adminService.getUserDetail(req.params.userId);
    return ok(res, detail);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listVerifications,
  decideVerification,
  getRecognitionRules,
  updateRecognitionRules,
  listReports,
  getReport,
  actionReport,
  reinstateUser,
  getDashboard,
  listStudents,
  listTutors,
  listSessions,
  getAnalytics,
  getUserDetail,
};
