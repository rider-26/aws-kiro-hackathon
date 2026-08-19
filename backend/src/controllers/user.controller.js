const userRepository = require('../repositories/userRepository');
const savedTutorService = require('../services/savedTutorService');
const learningSummaryService = require('../services/learningSummaryService');
const { sanitizeUser } = require('../utils/sanitize');
const { ok, created } = require('../utils/response');
const { ApiError } = require('../middleware/errorHandler');

// Fields a user is allowed to edit on their own profile.
const EDITABLE_FIELDS = ['full_name', 'course', 'year_of_study', 'profile_image'];

// Privacy setting, handled separately so it is always coerced to a boolean and
// can never be set implicitly by a stray field in the request body.
const PRIVACY_FIELD = 'share_learning_summary';

async function getOwnProfile(req, res, next) {
  try {
    const user = await userRepository.getById(req.user.id);
    if (!user) return next(new ApiError(404, 'User not found'));
    return ok(res, { user: sanitizeUser(user) });
  } catch (err) {
    return next(err);
  }
}

async function updateOwnProfile(req, res, next) {
  try {
    const patch = {};
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) patch[field] = req.body[field];
    }
    if (req.body[PRIVACY_FIELD] !== undefined) {
      patch[PRIVACY_FIELD] = !!req.body[PRIVACY_FIELD];
    }
    const updated = await userRepository.update(req.user.id, patch);
    return ok(res, { user: sanitizeUser(updated) });
  } catch (err) {
    return next(err);
  }
}

// --- Learning summary sharing (spec section 18) ---

async function getOwnSharingState(req, res, next) {
  try {
    const state = await learningSummaryService.getOwnSharingState(req.user.id);
    return ok(res, state);
  } catch (err) {
    return next(err);
  }
}

async function getSharedSummary(req, res, next) {
  try {
    const summary = await learningSummaryService.getSharedSummary(req.user.id, req.params.studentId);
    return ok(res, summary);
  } catch (err) {
    return next(err);
  }
}

async function checkSummaryAccess(req, res, next) {
  try {
    const access = await learningSummaryService.checkAccess(req.user.id, req.params.studentId);
    return ok(res, access);
  } catch (err) {
    return next(err);
  }
}

// --- Saved tutors ---

async function listSavedTutors(req, res, next) {
  try {
    const tutors = await savedTutorService.listSavedTutors(req.user.id);
    return ok(res, { tutors });
  } catch (err) {
    return next(err);
  }
}

async function listSavedTutorIds(req, res, next) {
  try {
    const ids = await savedTutorService.listSavedTutorIds(req.user.id);
    return ok(res, { tutor_ids: ids });
  } catch (err) {
    return next(err);
  }
}

async function saveTutor(req, res, next) {
  try {
    const saved = await savedTutorService.save(req.user.id, req.params.tutorId);
    return created(res, { saved });
  } catch (err) {
    return next(err);
  }
}

async function unsaveTutor(req, res, next) {
  try {
    const result = await savedTutorService.unsave(req.user.id, req.params.tutorId);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getOwnProfile,
  updateOwnProfile,
  getOwnSharingState,
  getSharedSummary,
  checkSummaryAccess,
  listSavedTutors,
  listSavedTutorIds,
  saveTutor,
  unsaveTutor,
};
