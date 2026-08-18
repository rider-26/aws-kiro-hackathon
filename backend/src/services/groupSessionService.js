const idGen = require('../utils/idGen');
const sessionRepository = require('../repositories/sessionRepository');
const sessionParticipantRepository = require('../repositories/sessionParticipantRepository');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const tutorVerificationRepository = require('../repositories/tutorVerificationRepository');
const moduleRepository = require('../repositories/moduleRepository');
const userRepository = require('../repositories/userRepository');
const sessionService = require('./sessionService');
const notificationService = require('./notificationService');
const { rangesOverlap } = require('../utils/timeUtils');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Group sessions (spec section 13).
 *
 * A group session is a TutoringSession with no originating booking
 * (`booking_id: null`) and `maximum_students > 1`. Students join directly by
 * creating a SessionParticipant row, which is the same membership record used
 * by chat and attendance — so a group session gets those features for free and
 * business rule 6 keeps applying unchanged.
 */

const SESSION_MODES = ['Physical', 'Online'];
const MIN_CAPACITY = 2;

/** A group session students may still join. */
function isOpen(session) {
  return session.status === 'Upcoming' && !session.booking_id;
}

/**
 * Tutor creates a group session. The tutor must be verified for the module
 * (business rule 1) and capacity cannot exceed their declared maximum group
 * size (business rule 3 — tutors control their own workload).
 */
async function createGroupSession(tutorUserId, payload) {
  const {
    title, module_id, topics, date, start_time, end_time,
    session_mode, location, maximum_students,
  } = payload;

  if (!title || !module_id || !date || !start_time || !end_time) {
    throw new ApiError(400, 'title, module_id, date, start_time and end_time are required');
  }
  if (session_mode && !SESSION_MODES.includes(session_mode)) {
    throw new ApiError(400, `session_mode must be one of ${SESSION_MODES.join(', ')}`);
  }
  if (start_time >= end_time) {
    throw new ApiError(400, 'start_time must be before end_time');
  }

  const profile = await tutorProfileRepository.getByUserId(tutorUserId);
  if (!profile) throw new ApiError(400, 'Set up your tutor profile before creating group sessions');

  const targetModule = await moduleRepository.getById(module_id);
  if (!targetModule) throw new ApiError(404, 'Module not found');

  const verifiedModuleIds = await tutorVerificationRepository.listVerifiedModuleIdsForTutor(profile.id);
  if (!verifiedModuleIds.includes(module_id)) {
    throw new ApiError(403, `You are not verified to tutor ${targetModule.module_code}`);
  }

  const requested = Number(maximum_students) || profile.maximum_group_size || MIN_CAPACITY;
  if (requested < MIN_CAPACITY) {
    throw new ApiError(400, `A group session needs capacity for at least ${MIN_CAPACITY} students`);
  }
  if (requested > (profile.maximum_group_size || MIN_CAPACITY)) {
    throw new ApiError(400, `Your profile allows a maximum group size of ${profile.maximum_group_size}`);
  }

  if (session_mode === 'Physical' && !profile.physical_enabled) {
    throw new ApiError(400, 'Your profile does not offer physical sessions');
  }
  if (session_mode === 'Online' && !profile.online_enabled) {
    throw new ApiError(400, 'Your profile does not offer online sessions');
  }

  // Same clash protection as accepting a booking (spec section 20).
  const existing = await sessionRepository.listByTutor(profile.id);
  const clash = existing.find((s) =>
    s.date === date &&
    ['Upcoming', 'In Progress'].includes(s.status) &&
    rangesOverlap(start_time, end_time, s.start_time, s.end_time)
  );
  if (clash) {
    throw new ApiError(409, `This clashes with your existing session on ${clash.date} at ${clash.start_time}–${clash.end_time}`);
  }

  return sessionRepository.create({
    id: idGen('session'),
    booking_id: null, // marks this as tutor-created rather than booking-derived
    tutor_id: profile.id,
    module_id,
    title,
    topics: Array.isArray(topics) ? topics : (topics ? [topics] : []),
    date,
    start_time,
    end_time,
    session_mode: session_mode || (profile.online_enabled ? 'Online' : 'Physical'),
    location: location || (session_mode === 'Online' ? 'Online (in-app)' : 'To be confirmed'),
    maximum_students: requested,
    status: 'Upcoming',
    start_timestamp: null,
    end_timestamp: null,
    attendance_verified: false,
    created_date: new Date().toISOString(),
  });
}

/** Adds participant counts and tutor/module details for browsing. */
async function hydrateForBrowsing(session, viewerId) {
  const participants = await sessionParticipantRepository.listBySession(session.id);
  const [targetModule, profile] = await Promise.all([
    moduleRepository.getById(session.module_id),
    tutorProfileRepository.getById(session.tutor_id),
  ]);
  const tutorUser = profile ? await userRepository.getById(profile.user_id) : null;

  const capacity = session.maximum_students || MIN_CAPACITY;
  const joinedCount = participants.length;

  return {
    ...session,
    module: targetModule,
    tutor: tutorUser
      ? {
          tutor_profile_id: profile.id,
          full_name: tutorUser.full_name,
          course: tutorUser.course,
          average_rating: profile.average_rating || 0,
        }
      : null,
    participant_count: joinedCount,
    capacity,
    spots_left: Math.max(0, capacity - joinedCount),
    is_full: joinedCount >= capacity,
    // Lets the UI render Join vs Joined without a second request.
    has_joined: participants.some((p) => p.student_id === viewerId),
  };
}

/**
 * Group sessions available to browse. Excludes booking-derived (private)
 * sessions, and by default excludes sessions that have already started.
 */
async function listGroupSessions(viewerId, { includePast = false, moduleId } = {}) {
  const all = await sessionRepository.listAll();

  let groupSessions = all.filter((s) => !s.booking_id && (s.maximum_students || 0) > 1);
  if (!includePast) {
    groupSessions = groupSessions.filter((s) => s.status === 'Upcoming');
  }
  if (moduleId) {
    groupSessions = groupSessions.filter((s) => s.module_id === moduleId);
  }

  const hydrated = await Promise.all(groupSessions.map((s) => hydrateForBrowsing(s, viewerId)));
  return hydrated.sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
}

/** The tutor's own group sessions. */
async function listOwnGroupSessions(tutorUserId) {
  const profile = await tutorProfileRepository.getByUserId(tutorUserId);
  if (!profile) return [];

  const sessions = await sessionRepository.listByTutor(profile.id);
  const groupSessions = sessions.filter((s) => !s.booking_id && (s.maximum_students || 0) > 1);

  const hydrated = await Promise.all(groupSessions.map((s) => hydrateForBrowsing(s, tutorUserId)));
  return hydrated.sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
}

/**
 * Student joins a group session. All three spec conditions are enforced:
 * the session must be active, capacity must not be reached, and the student
 * must not already have joined.
 */
async function joinGroupSession(sessionId, studentId) {
  const session = await sessionRepository.getById(sessionId);
  if (!session) throw new ApiError(404, 'Session not found');

  if (session.booking_id) {
    throw new ApiError(403, 'This is a private session and cannot be joined');
  }
  if (!isOpen(session)) {
    throw new ApiError(409, session.status === 'Upcoming'
      ? 'This session is not open for joining'
      : `This session is ${session.status.toLowerCase()} and can no longer be joined`);
  }

  const participants = await sessionParticipantRepository.listBySession(sessionId);

  if (participants.some((p) => p.student_id === studentId)) {
    throw new ApiError(409, 'You have already joined this session');
  }

  const capacity = session.maximum_students || MIN_CAPACITY;
  if (participants.length >= capacity) {
    throw new ApiError(409, 'This session is already full');
  }

  const participant = await sessionParticipantRepository.create({
    id: idGen('participant'),
    session_id: sessionId,
    student_id: studentId,
    attendance_status: 'Registered',
    check_in_time: null,
    check_out_time: null,
    completion_confirmed: false,
    joined_date: new Date().toISOString(),
  });

  const profile = await tutorProfileRepository.getById(session.tutor_id);
  const student = await userRepository.getById(studentId);
  if (profile) {
    await notificationService.notify(profile.user_id, {
      type: 'BookingAccepted',
      title: 'A student joined your group session',
      message: `${student?.full_name || 'A student'} joined "${session.title}" (${participants.length + 1}/${capacity}).`,
      link: `/sessions/${sessionId}`,
    });
  }

  return { participant, session: await hydrateForBrowsing(session, studentId) };
}

/** Student leaves a group session they haven't attended yet. */
async function leaveGroupSession(sessionId, studentId) {
  const { session, participant } = await sessionService.requireMembership(sessionId, { id: studentId, role: 'Tutee' });

  if (!participant) throw new ApiError(403, 'You are not a participant of this session');
  if (session.booking_id) {
    throw new ApiError(403, 'Cancel this through My Bookings instead');
  }
  if (session.status !== 'Upcoming') {
    throw new ApiError(409, 'You can only leave a session that has not started');
  }

  await sessionParticipantRepository.remove(participant.id);
  return { left: true };
}

module.exports = {
  createGroupSession,
  listGroupSessions,
  listOwnGroupSessions,
  joinGroupSession,
  leaveGroupSession,
  hydrateForBrowsing,
  isOpen,
  MIN_CAPACITY,
};
