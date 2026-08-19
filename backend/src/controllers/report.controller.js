const reportService = require('../services/reportService');
const { ok, created } = require('../utils/response');

async function getCategories(req, res, next) {
  try {
    return ok(res, { categories: reportService.REPORT_CATEGORIES });
  } catch (err) {
    return next(err);
  }
}

async function createReport(req, res, next) {
  try {
    const report = await reportService.createReport(req.user, req.body);
    return created(res, { report });
  } catch (err) {
    return next(err);
  }
}

async function listOwnReports(req, res, next) {
  try {
    const reports = await reportService.listOwnReports(req.user.id);
    return ok(res, { reports });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getCategories, createReport, listOwnReports };
