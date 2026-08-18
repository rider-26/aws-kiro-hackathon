const userRepository = require('../repositories/userRepository');
const sessionParticipantRepository = require('../repositories/sessionParticipantRepository');
const sessionRepository = require('../repositories/sessionRepository');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const bookingRepository = require('../repositories/bookingRepository');
const reviewRepository = require('../repositories/reviewRepository');
const progressService = require('./progressService');
const sessionService = require('./sessionService');
const searchService = require('./searchService');
const { sanitizeUser } = require('../utils/sanitize');

/**
 * Composes the role dashboards (spec sections 8 and 19) in a single call each,
 * so a dashboard renders from one request rather than a fan-out of six.
 *
 * The tutee dashboard is deliberately the shape spec section 8 asks for:
 * greeting, upcoming session, latest + previous quiz, learning improvement,
 * weak topics, and a recommended tutor with a match score.
 */

function isUpcoming(session) {
  return ['Upcoming', 'In Progress'].includes(session.status);
}

/** Soonest-first ordering on the session's calendar date and start time. */
function byWhenAscending(a, b) {
  return `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`);
}

/**
 * Picks the single best tutor for the student's weakest topics, and explains
 * why. Reuses the same rule-based scorer as Find Tutors so the dashboard's
 * "91% Match" and the search page's number can never disagree.
 */
async function getRecommendedTutor({ weakTopics, moduleId }) {
  if (!moduleId) return null;

  const results = await searchService.searchTutors({
    moduleId,
    weakTopics: weakTopics.map((t) => t.topic),
  });

  const best = results[0];
  if (!best) return null;

  return {
    tutor_profile_id: best.tutor_profile_id,
    user: best.user,
    profile: best.profile,
    verified_modules: best.verified_modules,
    topics: best.topics,
    match: best.match,
  };
}

async function getTuteeDashboard(userId) {
  const [user, progress, participations] = await Promise.all([
    userRepository.getById(userId),
    progressService.getProgress(userId),
    sessionParticipantRepository.listByStudent(userId),
  ]);

  const sessions = (
    await Promise.all(participations.map((p) => sessionRepository.getById(p.session_id)))
  ).filter(Boolean);

  const upcoming = sessions.filter(isUpcoming).sort(byWhenAscending);
  const nextSession = upcoming[0]
    ? await sessionService.hydrateSession(
        upcoming[0],
        await sessionParticipantRepository.listBySession(upcoming[0].id)
      )
    : null;

  const { improvement, weak_topics, developing_topics, strong_topics, history } = progress;

  // Recommend against the module the student most recently worked on, since
  // that's the context they're actually studying in.
  const latestModuleId = improvement.latest?.module_id || improvement.latest?.module?.id || null;
  const scopedWeak = weak_topics.filter((t) => !latestModuleId || t.module_id === latestModuleId);

  const recommended_tutor = await getRecommendedTutor({
    weakTopics: scopedWeak.length > 0 ? scopedWeak : weak_topics,
    moduleId: latestModuleId || weak_topics[0]?.module_id || null,
  });

  const bookings = await bookingRepository.listByStudent(userId);

  return {
    user: sanitizeUser(user),
    next_session: nextSession,
    upcoming_session_count: upcoming.length,
    latest_attempt: improvement.latest,
    previous_attempt: improvement.previous,
    improvement_delta: improvement.delta,
    attempt_count: history.length,
    weak_topics,
    developing_topics,
    strong_topics,
    recommended_tutor,
    pending_booking_count: bookings.filter((b) => b.status === 'Pending').length,
  };
}

async function getTutorDashboard(userId) {
  const [user, profile] = await Promise.all([
    userRepository.getById(userId),
    tutorProfileRepository.getByUserId(userId),
  ]);

  if (!profile) {
    return {
      user: sanitizeUser(user),
      profile: null,
      pending_requests: [],
      upcoming_sessions: [],
      stats: {
        pending_request_count: 0,
        upcoming_session_count: 0,
        students_helped: 0,
        average_rating: 0,
        tutoring_hours: 0,
      },
    };
  }

  const [bookings, sessions, reviews] = await Promise.all([
    bookingRepository.listByTutor(profile.id),
    sessionRepository.listByTutor(profile.id),
    reviewRepository.listByTutor(profile.id),
  ]);

  const pending = bookings.filter((b) => b.status === 'Pending');
  const pendingHydrated = await Promise.all(
    pending.map(async (b) => {
      const student = await userRepository.getById(b.student_id);
      return { ...b, student: sanitizeUser(student) };
    })
  );

  const upcoming = sessions.filter(isUpcoming).sort(byWhenAscending);
  const upcomingHydrated = await Promise.all(
    upcoming.slice(0, 5).map(async (s) =>
      sessionService.hydrateSession(s, await sessionParticipantRepository.listBySession(s.id))
    )
  );

  const completed = sessions.filter((s) => s.status === 'Completed');
  // Prefer measured session durations; fall back to the profile counter for
  // seeded history that predates the attendance flow.
  const measuredMinutes = completed.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const totalMinutes = measuredMinutes || profile.total_tutoring_minutes || 0;

  return {
    user: sanitizeUser(user),
    profile,
    pending_requests: pendingHydrated.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || '')),
    upcoming_sessions: upcomingHydrated,
    stats: {
      pending_request_count: pending.length,
      upcoming_session_count: upcoming.length,
      students_helped: profile.students_helped || 0,
      average_rating: profile.average_rating || 0,
      review_count: reviews.length,
      completed_sessions: profile.completed_sessions || completed.length,
      tutoring_hours: Math.round((totalMinutes / 60) * 10) / 10,
    },
  };
}

module.exports = { getTuteeDashboard, getTutorDashboard, getRecommendedTutor };
