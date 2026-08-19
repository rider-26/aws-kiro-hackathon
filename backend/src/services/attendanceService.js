const crypto = require('crypto');
const sessionRepository = require('../repositories/sessionRepository');
const sessionParticipantRepository = require('../repositories/sessionParticipantRepository');
const bookingRepository = require('../repositories/bookingRepository');
const sessionService = require('./sessionService');
const notificationService = require('./notificationService');
const recognitionService = require('./recognitionService');
const { publishToUsers } = require('../realtime/publisher');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Attendance simulation (spec section 21).
 *
 * ── Simulated, and labelled as such ──────────────────────────────────────
 * The check-in token below is a real, verifiable token generated and checked
 * by this backend — but the "QR scan" is simulated: the frontend renders the
 * token as a scannable-looking placeholder and the student confirms with a
 * click. There is no integration with any NYP system, and nothing in the app
 * claims otherwise (business rule 15).
 *
 * State machine:
 *   Upcoming --startSession--> In Progress --endSession--> Completed
 *                                   |
 *                                   +-- students check in (token verified)
 *                                   +-- students confirm completion
 *
 * `attendance_verified` becomes true only when at least one participant both
 * checked in AND confirmed completion, which is the gate Task 11's review
 * eligibility depends on.
 */

const ATTENDANCE_STATUS = {
  REGISTERED: 'Registered',
  CHECKED_IN: 'Checked In',
  ATTENDED: 'Attended',
  ABSENT: 'Absent',
};

function generateCheckInToken() {
  // Six uppercase alphanumeric characters — short enough to read aloud during
  // a demo, random enough not to be guessable in context.
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

/** Only the session's own tutor may drive session state. */
async function requireSessionTutor(sessionId, user) {
  const membership = await sessionService.resolveMembership(sessionId, user);
  if (!membership.isTutor) {
    throw new ApiError(403, 'Only the tutor running this session can do that');
  }
  return membership;
}

function durationMinutes(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return ms <= 0 ? 0 : Math.round(ms / 60000);
}

/** Recomputes attendance_verified from participant rows. */
function computeVerified(participants) {
  return participants.some((p) => !!p.check_in_time && !!p.completion_confirmed);
}

/**
 * Tutor starts the session: status -> In Progress, records the start timestamp
 * and issues the check-in token students will use.
 */
async function startSession(sessionId, user) {
  const { session, participants } = await requireSessionTutor(sessionId, user);

  if (session.status === 'In Progress') {
    throw new ApiError(409, 'This session has already been started');
  }
  if (session.status === 'Completed') {
    throw new ApiError(409, 'This session has already been completed');
  }
  if (session.status === 'Cancelled') {
    throw new ApiError(409, 'This session was cancelled');
  }

  const now = new Date().toISOString();
  const token = generateCheckInToken();

  const updated = await sessionRepository.update(sessionId, {
    status: 'In Progress',
    start_timestamp: now,
    check_in_token: token,
  });

  const recipients = await sessionService.memberUserIds(session, participants);
  try {
    await publishToUsers(recipients, { type: 'session_started', session_id: sessionId, check_in_token: token });
  } catch (err) {
    console.warn('[attendance] start broadcast failed:', err.message);
  }

  await Promise.all(
    participants.map((p) =>
      notificationService.notify(p.student_id, {
        type: 'SessionApproaching',
        title: 'Your session has started',
        message: `Check in with code ${token} to record your attendance.`,
        link: `/sessions/${sessionId}`,
      })
    )
  );

  return updated;
}

/**
 * Student checks in. The supplied token must match the one issued at start,
 * which is what makes the (simulated) QR flow meaningful rather than a bare
 * button press.
 */
async function checkIn(sessionId, user, { token }) {
  const { session, participant } = await sessionService.requireMembership(sessionId, user);

  if (!participant) {
    throw new ApiError(403, 'Only registered participants can check in');
  }
  if (session.status !== 'In Progress') {
    throw new ApiError(409, 'Check-in is only available while the session is in progress');
  }

  const supplied = String(token || '').trim().toUpperCase();
  if (!supplied) throw new ApiError(400, 'A check-in code is required');
  if (session.check_in_token && supplied !== session.check_in_token) {
    throw new ApiError(400, 'That check-in code is not valid for this session');
  }

  if (participant.check_in_time) {
    // Idempotent: re-scanning shouldn't be an error during a live demo.
    return participant;
  }

  const updated = await sessionParticipantRepository.update(participant.id, {
    attendance_status: ATTENDANCE_STATUS.CHECKED_IN,
    check_in_time: new Date().toISOString(),
  });

  const tutorProfileUserIds = await sessionService.memberUserIds(session, [participant]);
  try {
    await publishToUsers(tutorProfileUserIds, {
      type: 'participant_checked_in',
      session_id: sessionId,
      participant_id: participant.id,
    });
  } catch (err) {
    console.warn('[attendance] check-in broadcast failed:', err.message);
  }

  return updated;
}

/**
 * Tutor ends the session: records the end timestamp, computes duration, marks
 * anyone who never checked in as Absent, moves the session to Completed, and
 * cascades the linked booking to Completed as well.
 */
async function endSession(sessionId, user) {
  const { session, participants } = await requireSessionTutor(sessionId, user);

  if (session.status !== 'In Progress') {
    throw new ApiError(409, 'Only a session that is in progress can be ended');
  }

  const now = new Date().toISOString();
  const minutes = durationMinutes(session.start_timestamp, now);

  // Anyone who never checked in is recorded as Absent rather than left ambiguous.
  const refreshed = await Promise.all(
    participants.map(async (p) => {
      if (p.check_in_time) return p;
      return sessionParticipantRepository.update(p.id, {
        attendance_status: ATTENDANCE_STATUS.ABSENT,
      });
    })
  );

  const updated = await sessionRepository.update(sessionId, {
    status: 'Completed',
    end_timestamp: now,
    duration_minutes: minutes,
    attendance_verified: computeVerified(refreshed),
  });

  if (session.booking_id) {
    const booking = await bookingRepository.getById(session.booking_id);
    if (booking && booking.status === 'Accepted') {
      await bookingRepository.update(booking.id, { status: 'Completed' });
    }
  }

  const recipients = await sessionService.memberUserIds(session, participants);
  try {
    await publishToUsers(recipients, { type: 'session_ended', session_id: sessionId, duration_minutes: minutes });
  } catch (err) {
    console.warn('[attendance] end broadcast failed:', err.message);
  }

  // Only students who actually checked in are invited to confirm and review.
  await Promise.all(
    refreshed
      .filter((p) => !!p.check_in_time)
      .map((p) =>
        notificationService.notify(p.student_id, {
          type: 'SessionCompleted',
          title: 'Session completed',
          message: `Confirm your attendance and leave a review for this ${minutes}-minute session.`,
          link: `/sessions/${sessionId}`,
        })
      )
  );

  return updated;
}

/**
 * Participant confirms the session took place. This is the second half of
 * verified attendance — a check-in alone is not enough.
 */
async function confirmCompletion(sessionId, user) {
  const { session, participant } = await sessionService.requireMembership(sessionId, user);

  if (!participant) {
    throw new ApiError(403, 'Only participants can confirm completion');
  }
  if (!participant.check_in_time) {
    throw new ApiError(409, 'You did not check in to this session, so it cannot be confirmed');
  }
  if (session.status !== 'Completed') {
    throw new ApiError(409, 'You can confirm completion once the tutor has ended the session');
  }

  const updated = await sessionParticipantRepository.update(participant.id, {
    completion_confirmed: true,
    attendance_status: ATTENDANCE_STATUS.ATTENDED,
    check_out_time: participant.check_out_time || new Date().toISOString(),
  });

  // Re-derive verification across all participants now that this one confirmed.
  const allParticipants = await sessionParticipantRepository.listBySession(sessionId);
  const verified = computeVerified(allParticipants);
  if (verified !== !!session.attendance_verified) {
    await sessionRepository.update(sessionId, { attendance_verified: verified });
  }

  return updated;
}

/**
 * Full attendance view for a session: participant states, duration, verified
 * flag and the recognition eligibility breakdown. Members only.
 */
async function getAttendance(sessionId, user) {
  const membership = await sessionService.requireMembership(sessionId, user);
  const { session, participants } = membership;

  const hydrated = await sessionService.hydrateSession(session, participants);
  const recognition = await recognitionService.evaluateSession(session, participants);

  return {
    session: hydrated,
    is_tutor: membership.isTutor,
    // The token is only meaningful to the tutor, who displays it; students
    // receive it via the notification/broadcast when the session starts.
    check_in_token: membership.isTutor ? session.check_in_token || null : undefined,
    duration_minutes: session.duration_minutes || 0,
    attendance_verified: !!session.attendance_verified,
    own_participant: membership.participant || null,
    recognition,
  };
}

module.exports = {
  startSession,
  checkIn,
  endSession,
  confirmCompletion,
  getAttendance,
  generateCheckInToken,
  durationMinutes,
  computeVerified,
  ATTENDANCE_STATUS,
};
