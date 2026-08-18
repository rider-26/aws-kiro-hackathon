const idGen = require('../utils/idGen');
const reviewRepository = require('../repositories/reviewRepository');
const sessionParticipantRepository = require('../repositories/sessionParticipantRepository');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const userRepository = require('../repositories/userRepository');
const moduleRepository = require('../repositories/moduleRepository');
const sessionService = require('./sessionService');
const notificationService = require('./notificationService');
const { sanitizeUser } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Reviews (spec section 23).
 *
 * A review may only be created when ALL FOUR conditions hold
 * (business rule 7):
 *   1. the session status is Completed;
 *   2. the reviewer was a participant of that session;
 *   3. attendance was verified (checked in AND confirmed — see attendanceService);
 *   4. the reviewer has not already reviewed that session.
 *
 * Business rule 8 — "reviews cannot be directly edited by tutors" — is enforced
 * structurally: this module exposes no update or delete function at all, and
 * no route maps to one. A tutor's only interaction with a review is reading it.
 */

const RATING_FIELDS = [
  'knowledge_rating',
  'clarity_rating',
  'helpfulness_rating',
  'preparation_rating',
  'communication_rating',
  'overall_rating',
];

const MAX_COMMENT_LENGTH = 1000;

function validateRatings(payload) {
  const ratings = {};
  for (const field of RATING_FIELDS) {
    const value = Number(payload[field]);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new ApiError(400, `${field} must be a whole number between 1 and 5`);
    }
    ratings[field] = value;
  }
  return ratings;
}

/**
 * Determines whether a user may review a session, and why not if they can't.
 * Used both by the create path and by the UI to decide whether to offer the form.
 */
async function getEligibility(sessionId, user) {
  const { session, participant, isParticipant } = await sessionService.requireMembership(sessionId, user);

  if (!isParticipant) {
    return { eligible: false, reason: 'Only session participants can leave a review.' };
  }
  if (session.status !== 'Completed') {
    return { eligible: false, reason: 'You can review this session once it has been completed.' };
  }
  if (!session.attendance_verified) {
    return { eligible: false, reason: 'Attendance for this session has not been verified yet.' };
  }
  if (!participant.check_in_time || !participant.completion_confirmed) {
    return { eligible: false, reason: 'Confirm your attendance for this session before reviewing.' };
  }

  const existing = await reviewRepository.listBySession(sessionId);
  const own = existing.find((r) => r.student_id === user.id);
  if (own) {
    return { eligible: false, reason: 'You have already reviewed this session.', existing_review: own };
  }

  return { eligible: true, reason: null };
}

/** Recomputes a tutor's average rating and denormalized counters from all reviews. */
async function recomputeTutorRating(tutorProfileId) {
  const reviews = await reviewRepository.listByTutor(tutorProfileId);
  if (reviews.length === 0) {
    return tutorProfileRepository.update(tutorProfileId, { average_rating: 0, review_count: 0 });
  }

  const total = reviews.reduce((sum, r) => sum + (Number(r.overall_rating) || 0), 0);
  // One decimal place, matching how ratings are displayed.
  const average = Math.round((total / reviews.length) * 10) / 10;

  return tutorProfileRepository.update(tutorProfileId, {
    average_rating: average,
    review_count: reviews.length,
  });
}

async function createReview(sessionId, user, payload) {
  const eligibility = await getEligibility(sessionId, user);
  if (!eligibility.eligible) {
    // 409 for "already reviewed", 403 for anything the user simply may not do.
    const status = eligibility.existing_review ? 409 : 403;
    throw new ApiError(status, eligibility.reason);
  }

  const ratings = validateRatings(payload);
  const comment = String(payload.comment || '').trim();
  if (comment.length > MAX_COMMENT_LENGTH) {
    throw new ApiError(400, `comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
  }

  const { session } = await sessionService.resolveMembership(sessionId, user);

  const review = await reviewRepository.create({
    id: idGen('review'),
    session_id: sessionId,
    student_id: user.id,
    tutor_id: session.tutor_id,
    module_id: session.module_id,
    ...ratings,
    comment,
    // Every review created through this path is, by definition, from a verified
    // completed session — which is what the public "Verified Session" label means.
    verified_session: true,
    created_date: new Date().toISOString(),
  });

  const updatedProfile = await recomputeTutorRating(session.tutor_id);

  const tutorProfile = await tutorProfileRepository.getById(session.tutor_id);
  if (tutorProfile) {
    const student = await userRepository.getById(user.id);
    await notificationService.notify(tutorProfile.user_id, {
      type: 'ReviewAvailable',
      title: 'You received a new review',
      message: `${student?.full_name || 'A student'} rated your session ${ratings.overall_rating}/5.`,
      link: '/tutor/reviews',
    });
  }

  return { review, tutor_profile: updatedProfile };
}

/** Attaches reviewer and module details for display. */
async function hydrateReviews(reviews) {
  return Promise.all(
    reviews.map(async (r) => {
      const [student, moduleRecord] = await Promise.all([
        userRepository.getById(r.student_id),
        r.module_id ? moduleRepository.getById(r.module_id) : Promise.resolve(null),
      ]);
      const safeStudent = sanitizeUser(student);
      return {
        ...r,
        module: moduleRecord,
        student: safeStudent ? { id: safeStudent.id, full_name: safeStudent.full_name, course: safeStudent.course } : null,
      };
    })
  );
}

/** Public reviews for a tutor profile, newest first. */
async function listForTutor(tutorProfileId) {
  const reviews = await reviewRepository.listByTutor(tutorProfileId);
  const hydrated = await hydrateReviews(reviews);
  return hydrated.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
}

/** A tutor's own reviews plus per-dimension averages for their Reviews page. */
async function getOwnReviewSummary(tutorUserId) {
  const profile = await tutorProfileRepository.getByUserId(tutorUserId);
  if (!profile) {
    return { reviews: [], averages: null, count: 0 };
  }

  const reviews = await listForTutor(profile.id);
  if (reviews.length === 0) {
    return { reviews: [], averages: null, count: 0, profile };
  }

  const averages = {};
  for (const field of RATING_FIELDS) {
    const total = reviews.reduce((sum, r) => sum + (Number(r[field]) || 0), 0);
    averages[field] = Math.round((total / reviews.length) * 10) / 10;
  }

  return { reviews, averages, count: reviews.length, profile };
}

module.exports = {
  createReview,
  getEligibility,
  listForTutor,
  getOwnReviewSummary,
  recomputeTutorRating,
  validateRatings,
  RATING_FIELDS,
  MAX_COMMENT_LENGTH,
};
