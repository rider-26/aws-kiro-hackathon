const sessionRepository = require('../repositories/sessionRepository');
const sessionParticipantRepository = require('../repositories/sessionParticipantRepository');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const userRepository = require('../repositories/userRepository');
const moduleRepository = require('../repositories/moduleRepository');
const bookingRepository = require('../repositories/bookingRepository');
const { sanitizeUser } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Resolves whether a user is a member of a session, and in what capacity.
 *
 * This is the single authority for session membership in the app. Business
 * rule 6 ("only session members can access session chat") and the attendance
 * rules in Task 10 both derive from this function, so membership logic never
 * gets duplicated or drift out of sync.
 *
 * Note: Admins are deliberately NOT members. Admin oversight of sessions is
 * exposed through the admin session-records views, not by joining private
 * conversations.
 */
async function resolveMembership(sessionId, user) {
  const session = await sessionRepository.getById(sessionId);
  if (!session) throw new ApiError(404, 'Session not found');

  const participants = await sessionParticipantRepository.listBySession(sessionId);

  let isTutor = false;
  if (user.role === 'Tutor') {
    const tutorProfile = await tutorProfileRepository.getByUserId(user.id);
    isTutor = !!tutorProfile && tutorProfile.id === session.tutor_id;
  }

  const participant = participants.find((p) => p.student_id === user.id) || null;
  const isParticipant = !!participant;

  return {
    session,
    participants,
    isTutor,
    isParticipant,
    isMember: isTutor || isParticipant,
    participant,
  };
}

/** Same as resolveMembership but throws 403 for non-members. */
async function requireMembership(sessionId, user) {
  const membership = await resolveMembership(sessionId, user);
  if (!membership.isMember) {
    throw new ApiError(403, 'You do not have access to this session');
  }
  return membership;
}

/** Every user id that should receive real-time events for a session. */
async function memberUserIds(session, participants) {
  const tutorProfile = await tutorProfileRepository.getById(session.tutor_id);
  const ids = participants.map((p) => p.student_id);
  if (tutorProfile) ids.push(tutorProfile.user_id);
  return [...new Set(ids)];
}

/** Hydrates a session with module, tutor, booking and participant user details. */
async function hydrateSession(session, participants) {
  const [targetModule, tutorProfile, booking] = await Promise.all([
    moduleRepository.getById(session.module_id),
    tutorProfileRepository.getById(session.tutor_id),
    session.booking_id ? bookingRepository.getById(session.booking_id) : Promise.resolve(null),
  ]);

  const tutorUser = tutorProfile ? await userRepository.getById(tutorProfile.user_id) : null;
  const participantUsers = await Promise.all(
    participants.map(async (p) => {
      const u = await userRepository.getById(p.student_id);
      return { ...p, user: sanitizeUser(u) };
    })
  );

  return {
    ...session,
    module: targetModule,
    booking,
    tutor: tutorUser
      ? { tutor_profile_id: tutorProfile.id, user: sanitizeUser(tutorUser), profile: tutorProfile }
      : null,
    participants: participantUsers,
    participant_count: participants.length,
  };
}

/** Session detail for a member (chat page, attendance panel). */
async function getSessionForUser(sessionId, user) {
  const { session, participants } = await requireMembership(sessionId, user);
  return hydrateSession(session, participants);
}

/**
 * All sessions the user belongs to — tutor's own sessions, or the sessions a
 * student is a participant of. Used by the Messages list and Sessions pages.
 */
async function listSessionsForUser(user) {
  let sessions = [];

  if (user.role === 'Tutor') {
    const tutorProfile = await tutorProfileRepository.getByUserId(user.id);
    if (tutorProfile) {
      sessions = await sessionRepository.listByTutor(tutorProfile.id);
    }
  } else {
    const memberships = await sessionParticipantRepository.listByStudent(user.id);
    sessions = (
      await Promise.all(memberships.map((m) => sessionRepository.getById(m.session_id)))
    ).filter(Boolean);
  }

  const hydrated = await Promise.all(
    sessions.map(async (s) => {
      const participants = await sessionParticipantRepository.listBySession(s.id);
      return hydrateSession(s, participants);
    })
  );

  // Soonest first for upcoming/in-progress, then most recent past sessions.
  return hydrated.sort((a, b) => {
    const aKey = `${a.date} ${a.start_time}`;
    const bKey = `${b.date} ${b.start_time}`;
    return aKey.localeCompare(bKey);
  });
}

module.exports = {
  resolveMembership,
  requireMembership,
  memberUserIds,
  hydrateSession,
  getSessionForUser,
  listSessionsForUser,
};
