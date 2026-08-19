const userRepository = require('../repositories/userRepository');
const bookingRepository = require('../repositories/bookingRepository');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const moduleRepository = require('../repositories/moduleRepository');
const progressService = require('./progressService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Learning summary sharing (spec section 18).
 *
 * ── Two independent conditions, both required (business rules 9 & 10) ─────
 * A tutor may see a student's learning summary ONLY when:
 *   1. the student currently has `share_learning_summary` enabled, and
 *   2. there is an active tutoring relationship between them — at least one
 *      booking that is Pending, Accepted or Completed.
 *
 * Gating on the student's LIVE flag (rather than a snapshot taken at booking
 * time) means switching the toggle off revokes tutor access immediately, which
 * is the behaviour a privacy setting should have.
 *
 * What is shared is deliberately narrow: latest quiz score, weak topics,
 * strong topics and a suggested focus. Raw quiz answers, individual attempts,
 * study material and any other module's data are never included — a tutor
 * cannot reach unrelated student study data through this endpoint.
 */

const SHARED_BOOKING_STATUSES = ['Pending', 'Accepted', 'Completed'];

/**
 * Resolves whether the requesting tutor may view this student's summary.
 * @returns {{allowed: boolean, reason: string|null, bookings: Array}}
 */
async function resolveAccess(tutorUserId, studentId) {
  const [student, tutorProfile] = await Promise.all([
    userRepository.getById(studentId),
    tutorProfileRepository.getByUserId(tutorUserId),
  ]);

  if (!student) throw new ApiError(404, 'Student not found');
  if (!tutorProfile) {
    return { allowed: false, reason: 'You do not have a tutor profile.', bookings: [] };
  }

  const tutorBookings = await bookingRepository.listByTutor(tutorProfile.id);
  const shared = tutorBookings.filter(
    (b) => b.student_id === studentId && SHARED_BOOKING_STATUSES.includes(b.status)
  );

  if (shared.length === 0) {
    return {
      allowed: false,
      reason: 'You can only view a learning summary for a student you have a booking with.',
      bookings: [],
    };
  }

  if (!student.share_learning_summary) {
    return {
      allowed: false,
      reason: 'This student has not shared their learning summary.',
      bookings: shared,
    };
  }

  return { allowed: true, reason: null, bookings: shared };
}

/** Plain-language focus suggestion derived from the weakest topics. */
function buildSuggestedFocus(weakTopics, developingTopics) {
  if (weakTopics.length > 0) {
    const names = weakTopics.slice(0, 3).map((t) => t.topic);
    return `Start with ${names.join(', ')} — these are scoring below 60%.`;
  }
  if (developingTopics.length > 0) {
    const names = developingTopics.slice(0, 3).map((t) => t.topic);
    return `Consolidate ${names.join(', ')} to move them into the strong range.`;
  }
  return 'No weak topics recorded. Consider extending into harder applications of the module.';
}

/**
 * The tutor-facing summary. Throws 403 with a specific reason when either
 * condition is unmet, so the UI can explain the situation accurately.
 */
async function getSharedSummary(tutorUserId, studentId) {
  const access = await resolveAccess(tutorUserId, studentId);
  if (!access.allowed) {
    throw new ApiError(403, access.reason);
  }

  const student = await userRepository.getById(studentId);
  const progress = await progressService.getProgress(studentId);

  const { improvement, weak_topics, developing_topics, strong_topics } = progress;
  const latest = improvement.latest;

  // Resolve module names for the topics being surfaced.
  const moduleIds = [...new Set([...weak_topics, ...strong_topics, ...developing_topics].map((t) => t.module_id).filter(Boolean))];
  const modules = await Promise.all(moduleIds.map((id) => moduleRepository.getById(id)));
  const moduleById = new Map(modules.filter(Boolean).map((m) => [m.id, m]));

  function decorate(topics) {
    return topics.map((t) => ({
      topic: t.topic,
      score_percentage: t.score_percentage,
      status: t.status,
      module_code: moduleById.get(t.module_id)?.module_code || null,
    }));
  }

  return {
    student: {
      id: student.id,
      full_name: student.full_name,
      course: student.course,
      year_of_study: student.year_of_study,
    },
    // Only the headline score, never the individual answers.
    latest_quiz: latest
      ? {
          score: latest.score,
          total_questions: latest.total_questions,
          percentage: latest.percentage,
          completed_date: latest.completed_date,
          module_code: latest.module?.module_code || null,
        }
      : null,
    improvement_delta: improvement.delta,
    weak_topics: decorate(weak_topics),
    developing_topics: decorate(developing_topics),
    strong_topics: decorate(strong_topics),
    suggested_focus: buildSuggestedFocus(weak_topics, developing_topics),
    shared_by_student: true,
    notice: 'Shared voluntarily by the student. They can withdraw access at any time.',
  };
}

/**
 * Lightweight check used by session views to decide whether to offer the
 * summary at all, without throwing.
 */
async function checkAccess(tutorUserId, studentId) {
  const access = await resolveAccess(tutorUserId, studentId);
  return { allowed: access.allowed, reason: access.reason };
}

/** The student's own view of what they are sharing, and with whom. */
async function getOwnSharingState(studentId) {
  const student = await userRepository.getById(studentId);
  if (!student) throw new ApiError(404, 'User not found');

  const bookings = await bookingRepository.listByStudent(studentId);
  const activeTutorIds = [
    ...new Set(
      bookings
        .filter((b) => SHARED_BOOKING_STATUSES.includes(b.status))
        .map((b) => b.tutor_id)
    ),
  ];

  const tutors = await Promise.all(
    activeTutorIds.map(async (tutorProfileId) => {
      const profile = await tutorProfileRepository.getById(tutorProfileId);
      if (!profile) return null;
      const tutorUser = await userRepository.getById(profile.user_id);
      return tutorUser ? { tutor_profile_id: profile.id, full_name: tutorUser.full_name } : null;
    })
  );

  return {
    share_learning_summary: !!student.share_learning_summary,
    // Exactly who would gain access if the toggle is on.
    shared_with: tutors.filter(Boolean),
  };
}

module.exports = {
  getSharedSummary,
  checkAccess,
  getOwnSharingState,
  resolveAccess,
  buildSuggestedFocus,
  SHARED_BOOKING_STATUSES,
};
