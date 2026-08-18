const userRepository = require('../repositories/userRepository');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const tutorVerificationRepository = require('../repositories/tutorVerificationRepository');
const sessionRepository = require('../repositories/sessionRepository');
const sessionParticipantRepository = require('../repositories/sessionParticipantRepository');
const bookingRepository = require('../repositories/bookingRepository');
const moduleRepository = require('../repositories/moduleRepository');
const reviewRepository = require('../repositories/reviewRepository');
const userReportRepository = require('../repositories/userReportRepository');
const quizAttemptRepository = require('../repositories/quizAttemptRepository');
const topicPerformanceRepository = require('../repositories/topicPerformanceRepository');
const recognitionService = require('./recognitionService');
const { sanitizeUser } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Admin oversight views (spec sections 23, 24 and 27).
 *
 * Two boundaries worth stating explicitly:
 *
 * 1. Admins get session RECORDS, not session CONTENT. These functions return
 *    who attended, when, for how long, and whether recognition criteria were
 *    met — they never return chat messages. Private chat stays scoped to
 *    session members (business rule 6), and sessionService.resolveMembership
 *    deliberately does not treat admins as members.
 *
 * 2. Analytics are aggregate. Per-student quiz answers and uploaded materials
 *    are private learning data (business rule 9); the counts and averages here
 *    are derived without exposing any individual's responses.
 *
 * These read paths use table scans, which is acceptable at NYP module scale and
 * for a demo dataset. At real scale these would move to pre-aggregated counters
 * updated on write, since a scan cost grows with the whole table.
 */

function round1(n) {
  return Math.round(n * 10) / 10;
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/** Groups an array by a key function into a plain count map. */
function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (key === null || key === undefined) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function isGroupSession(session) {
  return !session.booking_id;
}

// ---------------------------------------------------------------------------
// Dashboard (spec section 23)
// ---------------------------------------------------------------------------

async function getDashboard() {
  const [users, verifications, sessions, bookings, reports, profiles] = await Promise.all([
    userRepository.listAll(),
    tutorVerificationRepository.listAll(),
    sessionRepository.listAll(),
    bookingRepository.listAll(),
    userReportRepository.listAll(),
    tutorProfileRepository.listAll(),
  ]);

  const tutees = users.filter((u) => u.role === 'Tutee');
  const tutors = users.filter((u) => u.role === 'Tutor');
  const suspended = users.filter((u) => (u.account_status || 'Active') === 'Suspended');

  const completedSessions = sessions.filter((s) => s.status === 'Completed');
  const totalMinutes = completedSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  const ratedProfiles = profiles.filter((p) => (p.average_rating || 0) > 0);
  const platformRating = ratedProfiles.length
    ? round1(ratedProfiles.reduce((sum, p) => sum + p.average_rating, 0) / ratedProfiles.length)
    : 0;

  const pendingVerifications = verifications.filter((v) => v.status === 'Pending');
  const pendingReports = reports.filter((r) => r.status === 'Pending');

  // Hydrate only the small action queues — the admin needs names on the items
  // they're being asked to act on, not on every record in the system.
  const verificationService = require('./verificationService');
  const actionableVerifications = await Promise.all(
    pendingVerifications
      .sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''))
      .slice(0, 5)
      .map((v) => verificationService.hydrate(v))
  );

  const actionableReports = await Promise.all(
    pendingReports
      .sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''))
      .slice(0, 5)
      .map(async (r) => {
        const [reporter, reported] = await Promise.all([
          userRepository.getById(r.reporter_id),
          userRepository.getById(r.reported_user_id),
        ]);
        return {
          id: r.id,
          category: r.category,
          status: r.status,
          created_date: r.created_date,
          reporter: sanitizeUser(reporter),
          reported_user: sanitizeUser(reported),
        };
      })
  );

  return {
    stats: {
      total_students: tutees.length,
      total_tutors: tutors.length,
      suspended_accounts: suspended.length,
      verified_tutor_modules: verifications.filter((v) => v.status === 'Verified').length,
      pending_verifications: pendingVerifications.length,
      pending_reports: pendingReports.length,
      total_sessions: sessions.length,
      completed_sessions: completedSessions.length,
      upcoming_sessions: sessions.filter((s) => ['Upcoming', 'In Progress'].includes(s.status)).length,
      total_bookings: bookings.length,
      pending_bookings: bookings.filter((b) => b.status === 'Pending').length,
      tutoring_hours: round1(totalMinutes / 60),
      platform_average_rating: platformRating,
    },
    // The two queues that need a human decision, surfaced on the landing page.
    action_required: {
      verifications: actionableVerifications,
      reports: actionableReports,
    },
  };
}

// ---------------------------------------------------------------------------
// Students (spec section 24)
// ---------------------------------------------------------------------------

/**
 * Student roster with engagement counts. Deliberately returns quiz ATTEMPT
 * COUNTS and the latest score, not per-question responses — an admin needs to
 * see engagement, not read a student's answers (business rule 9).
 */
async function listStudents({ search } = {}) {
  const users = await userRepository.listAll();
  let tutees = users.filter((u) => u.role === 'Tutee');

  if (search) {
    const q = search.toLowerCase();
    tutees = tutees.filter(
      (u) =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.course || '').toLowerCase().includes(q)
    );
  }

  const students = await Promise.all(
    tutees.map(async (u) => {
      const [attempts, bookings, participations] = await Promise.all([
        quizAttemptRepository.listByStudent(u.id),
        bookingRepository.listByStudent(u.id),
        sessionParticipantRepository.listByStudent(u.id),
      ]);

      const completedAttempts = attempts
        .filter((a) => a.status === 'Completed')
        .sort((a, b) => (b.completed_date || '').localeCompare(a.completed_date || ''));

      const attended = participations.filter((p) => p.attendance_status === 'Attended').length;

      return {
        ...sanitizeUser(u),
        account_status: u.account_status || 'Active',
        quiz_attempt_count: completedAttempts.length,
        latest_quiz_percentage: completedAttempts[0]?.percentage ?? null,
        latest_quiz_date: completedAttempts[0]?.completed_date ?? null,
        booking_count: bookings.length,
        session_count: participations.length,
        sessions_attended: attended,
        shares_learning_summary: !!u.share_learning_summary,
      };
    })
  );

  return students.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
}

// ---------------------------------------------------------------------------
// Tutors (spec section 24)
// ---------------------------------------------------------------------------

async function listTutors({ search } = {}) {
  const users = await userRepository.listAll();
  let tutorUsers = users.filter((u) => u.role === 'Tutor');

  if (search) {
    const q = search.toLowerCase();
    tutorUsers = tutorUsers.filter(
      (u) => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
  }

  const tutors = await Promise.all(
    tutorUsers.map(async (u) => {
      const profile = await tutorProfileRepository.getByUserId(u.id);
      if (!profile) {
        // A Tutor account that never opened its profile page has no profile row
        // yet. Show it rather than hiding it, so admins can see the gap.
        return {
          ...sanitizeUser(u),
          account_status: u.account_status || 'Active',
          tutor_profile_id: null,
          has_profile: false,
          verified_module_count: 0,
          pending_verification_count: 0,
          verified_modules: [],
          average_rating: 0,
          review_count: 0,
          completed_sessions: 0,
          upcoming_sessions: 0,
        };
      }

      const [verifications, reviews, sessions] = await Promise.all([
        tutorVerificationRepository.listByTutor(profile.id),
        reviewRepository.listByTutor(profile.id),
        sessionRepository.listByTutor(profile.id),
      ]);

      const verified = verifications.filter((v) => v.status === 'Verified');
      const modules = (await Promise.all(verified.map((v) => moduleRepository.getById(v.module_id)))).filter(Boolean);

      return {
        ...sanitizeUser(u),
        account_status: u.account_status || 'Active',
        tutor_profile_id: profile.id,
        has_profile: true,
        verified_module_count: verified.length,
        pending_verification_count: verifications.filter((v) => v.status === 'Pending').length,
        verified_modules: modules.map((m) => ({ id: m.id, module_code: m.module_code, module_name: m.module_name })),
        average_rating: profile.average_rating || 0,
        review_count: reviews.length,
        completed_sessions: sessions.filter((s) => s.status === 'Completed').length,
        upcoming_sessions: sessions.filter((s) => ['Upcoming', 'In Progress'].includes(s.status)).length,
      };
    })
  );

  return tutors.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
}

// ---------------------------------------------------------------------------
// Session records (spec section 24)
// ---------------------------------------------------------------------------

/**
 * Session records for oversight. Returns attendance and recognition state —
 * NEVER chat content. If an admin needs to see what was said in a session,
 * that has to come through a report with the participants' knowledge, not a
 * silent read of a private conversation.
 */
async function listSessions({ status, moduleId } = {}) {
  const all = await sessionRepository.listAll();

  let filtered = all;
  if (status) filtered = filtered.filter((s) => s.status === status);
  if (moduleId) filtered = filtered.filter((s) => s.module_id === moduleId);

  const rules = await recognitionService.getRules();

  const sessions = await Promise.all(
    filtered.map(async (s) => {
      const [participants, targetModule, profile] = await Promise.all([
        sessionParticipantRepository.listBySession(s.id),
        s.module_id ? moduleRepository.getById(s.module_id) : null,
        s.tutor_id ? tutorProfileRepository.getById(s.tutor_id) : null,
      ]);

      const tutorUser = profile ? await userRepository.getById(profile.user_id) : null;
      const recognition = recognitionService.evaluate(s, participants, rules);

      return {
        id: s.id,
        title: s.title,
        status: s.status,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        session_mode: s.session_mode,
        location: s.location,
        duration_minutes: s.duration_minutes || null,
        attendance_verified: !!s.attendance_verified,
        is_group_session: isGroupSession(s),
        maximum_students: s.maximum_students || 1,
        module: targetModule
          ? { id: targetModule.id, module_code: targetModule.module_code, module_name: targetModule.module_name }
          : null,
        tutor: tutorUser ? { id: tutorUser.id, full_name: tutorUser.full_name, course: tutorUser.course } : null,
        participant_count: participants.length,
        checked_in_count: participants.filter((p) => p.check_in_time).length,
        recognition_status: recognition.status,
        recognition_criteria: recognition.criteria,
      };
    })
  );

  // Newest session date first — the admin's usual question is "what happened
  // recently", not "what happened first".
  return sessions.sort((a, b) => `${b.date} ${b.start_time}`.localeCompare(`${a.date} ${a.start_time}`));
}

// ---------------------------------------------------------------------------
// Analytics (spec section 27)
// ---------------------------------------------------------------------------

/**
 * Aggregate platform analytics. Every figure here is a count or an average
 * across users — no individual's quiz answers, chat, or uploaded material is
 * read or returned.
 */
async function getAnalytics() {
  const [modules, sessions, bookings, verifications, reviews, reports, attempts, topicPerf, users] =
    await Promise.all([
      moduleRepository.listAll(),
      sessionRepository.listAll(),
      bookingRepository.listAll(),
      tutorVerificationRepository.listAll(),
      reviewRepository.listAll(),
      userReportRepository.listAll(),
      quizAttemptRepository.listAll(),
      topicPerformanceRepository.listAll(),
      userRepository.listAll(),
    ]);

  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const completedAttempts = attempts.filter((a) => a.status === 'Completed');
  const completedSessions = sessions.filter((s) => s.status === 'Completed');

  // --- Demand per module: bookings + sessions + verified tutor supply -------
  const bookingsByModule = countBy(bookings, (b) => b.module_id);
  const sessionsByModule = countBy(sessions, (s) => s.module_id);
  const verifiedTutorsByModule = countBy(
    verifications.filter((v) => v.status === 'Verified'),
    (v) => v.module_id
  );

  const moduleDemand = modules
    .map((m) => ({
      module_id: m.id,
      module_code: m.module_code,
      module_name: m.module_name,
      booking_count: bookingsByModule[m.id] || 0,
      session_count: sessionsByModule[m.id] || 0,
      verified_tutor_count: verifiedTutorsByModule[m.id] || 0,
    }))
    .sort((a, b) => b.booking_count - a.booking_count || b.session_count - a.session_count);

  // --- Booking funnel ------------------------------------------------------
  const bookingsByStatus = countBy(bookings, (b) => b.status);
  const declined = bookings.filter((b) => b.status === 'Declined');
  const declineReasons = countBy(declined, (b) => b.decline_reason || 'Not specified');

  // --- Weakest topics across the cohort -----------------------------------
  // Averaged across students so one struggling student doesn't define a topic
  // as a platform-wide gap. This is the signal for "which modules need more
  // verified tutors", which is the point of spec section 27.
  const topicGroups = topicPerf.reduce((acc, row) => {
    const key = `${row.module_id}::${row.topic}`;
    if (!acc[key]) acc[key] = { module_id: row.module_id, topic: row.topic, scores: [] };
    acc[key].scores.push(row.score_percentage || 0);
    return acc;
  }, {});

  const topicGaps = Object.values(topicGroups)
    .map((g) => ({
      module_id: g.module_id,
      module_code: moduleById.get(g.module_id)?.module_code || 'Unknown',
      topic: g.topic,
      student_count: g.scores.length,
      average_percentage: Math.round(g.scores.reduce((a, b) => a + b, 0) / g.scores.length),
      verified_tutor_count: verifiedTutorsByModule[g.module_id] || 0,
    }))
    .sort((a, b) => a.average_percentage - b.average_percentage);

  // --- Quiz engagement ----------------------------------------------------
  const averageQuizScore = completedAttempts.length
    ? Math.round(
        completedAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / completedAttempts.length
      )
    : 0;

  // Retake rate: students who completed more than one attempt. This is the
  // closest honest proxy for "did the study → tutor → retest loop close".
  const attemptsByStudent = countBy(completedAttempts, (a) => a.student_id);
  const studentsWithAttempts = Object.keys(attemptsByStudent).length;
  const studentsWithRetake = Object.values(attemptsByStudent).filter((n) => n > 1).length;

  const tutees = users.filter((u) => u.role === 'Tutee');

  // --- Recognition ---------------------------------------------------------
  const rules = await recognitionService.getRules();
  let recognitionEligible = 0;
  for (const s of completedSessions) {
    const participants = await sessionParticipantRepository.listBySession(s.id);
    if (recognitionService.evaluate(s, participants, rules).all_criteria_met) recognitionEligible += 1;
  }

  return {
    module_demand: moduleDemand,
    booking_funnel: {
      total: bookings.length,
      pending: bookingsByStatus.Pending || 0,
      accepted: bookingsByStatus.Accepted || 0,
      declined: bookingsByStatus.Declined || 0,
      cancelled: bookingsByStatus.Cancelled || 0,
      completed: bookingsByStatus.Completed || 0,
      acceptance_rate: pct(
        (bookingsByStatus.Accepted || 0) + (bookingsByStatus.Completed || 0),
        bookings.length
      ),
      decline_reasons: Object.entries(declineReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    },
    sessions: {
      total: sessions.length,
      completed: completedSessions.length,
      cancelled: sessions.filter((s) => s.status === 'Cancelled').length,
      group_sessions: sessions.filter(isGroupSession).length,
      completion_rate: pct(completedSessions.length, sessions.length),
      total_hours: round1(completedSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / 60),
      average_duration_minutes: completedSessions.length
        ? Math.round(
            completedSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / completedSessions.length
          )
        : 0,
      attendance_verified: completedSessions.filter((s) => s.attendance_verified).length,
      recognition_eligible: recognitionEligible,
    },
    learning: {
      total_attempts: completedAttempts.length,
      average_score_percentage: averageQuizScore,
      students_with_attempts: studentsWithAttempts,
      students_with_retake: studentsWithRetake,
      retake_rate: pct(studentsWithRetake, studentsWithAttempts),
      quiz_participation_rate: pct(studentsWithAttempts, tutees.length),
      topic_gaps: topicGaps.slice(0, 10),
    },
    quality: {
      review_count: reviews.length,
      average_rating: reviews.length
        ? round1(reviews.reduce((sum, r) => sum + (r.overall_rating || 0), 0) / reviews.length)
        : 0,
      report_count: reports.length,
      open_reports: reports.filter((r) => ['Pending', 'Under Review'].includes(r.status)).length,
      reports_by_category: Object.entries(countBy(reports, (r) => r.category))
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
    },
    // States what these numbers are and aren't, so nobody reads a demo dataset
    // as a validated research finding.
    notice:
      'Aggregate platform figures computed from current records. No individual quiz answers, chat messages or uploaded materials are read to produce them.',
  };
}

// ---------------------------------------------------------------------------
// Account status (shared with moderation)
// ---------------------------------------------------------------------------

async function getUserDetail(userId) {
  const user = await userRepository.getById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const reportsAgainst = await userReportRepository.listByReportedUser(userId);

  return {
    user: { ...sanitizeUser(user), account_status: user.account_status || 'Active' },
    reports_against_count: reportsAgainst.length,
    open_reports_against: reportsAgainst.filter((r) => ['Pending', 'Under Review'].includes(r.status)).length,
  };
}

module.exports = {
  getDashboard,
  listStudents,
  listTutors,
  listSessions,
  getAnalytics,
  getUserDetail,
};
