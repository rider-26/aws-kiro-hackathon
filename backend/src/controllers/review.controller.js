const reviewService = require('../services/reviewService');
const { ok, created } = require('../utils/response');

async function createReview(req, res, next) {
  try {
    const result = await reviewService.createReview(req.params.sessionId, req.user, req.body);
    return created(res, result);
  } catch (err) {
    return next(err);
  }
}

async function getEligibility(req, res, next) {
  try {
    const eligibility = await reviewService.getEligibility(req.params.sessionId, req.user);
    return ok(res, eligibility);
  } catch (err) {
    return next(err);
  }
}

async function listForTutor(req, res, next) {
  try {
    const reviews = await reviewService.listForTutor(req.params.tutorId);
    return ok(res, { reviews });
  } catch (err) {
    return next(err);
  }
}

async function getOwnReviews(req, res, next) {
  try {
    const summary = await reviewService.getOwnReviewSummary(req.user.id);
    return ok(res, summary);
  } catch (err) {
    return next(err);
  }
}

module.exports = { createReview, getEligibility, listForTutor, getOwnReviews };
