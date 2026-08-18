const idGen = require('../utils/idGen');
const bookingRepository = require('../repositories/bookingRepository');
const sessionRepository = require('../repositories/sessionRepository');
const sessionParticipantRepository = require('../repositories/sessionParticipantRepository');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const tutorAvailabilityRepository = require('../repositories/tutorAvailabilityRepository');
const tutorVerificationRepository = require('../repositories/tutorVerificationRepository');
const moduleRepository = require('../repositories/moduleRepository');
const userRepository = require('../repositories/userRepository');
const notificationService = require('./notificationService');
const searchService = require('./searchService');
const { sanitizeUser } = require('../utils/sanitize');
const { rangesOverlap, fitsWithinSlot } = require('../utils/timeUtils');
const { ApiError } = require('../middleware/errorHandler');

const BOOKING_STATUSES = ['Pending', 'Accepted', 'Declined', 'Cancelled', 'Completed'];
const DECLINE_REASONS = [
  'Scheduling Conflict',
  'Capacity Reached',
  'Topic Outside Expertise',
  'Unavailable',
  'Other',
];
const SESSION_TYPES = ['Individual', 'Group'];
const SESSION_MODES = ['Physical', 'Online'];

/**
 * Creates a booking request (spec section 12). Enforces:
 *  - tutor must be VERIFIED for the requested module (business rule 1)
 *  - requested slot must fall inside the tutor's declared availability
 *    (business rule 4: students cannot book a slot that is unavailable)
 *  - requested mode must be one the tutor actually supports
 *  - group size must not exceed the tutor's declared maximum
 * Always created with status Pending, then the tutor is notified.
 */
async function createBooking(studentId, payload) {
  const {
    tutor_id, module_id, topics, date, start_time, end_time,
    session_type, session_mode, student_message,
  } = payload;

  if (!tutor_id || !module_id || !date || !start_time || !end_time) {
    throw new ApiError(400, 'tutor_id, module_id, date, start_time and end_time are required');
  }
  if (session_type && !SESSION_TYPES.includes(session_type)) {
    throw new ApiError(400, `session_type must be one of ${SESSION_TYPES.join(', ')}`);
  }
  if (session_mode && !SESSION_MODES.includes(session_mode)) {
    throw new ApiError(400, `session_mode must be one of ${SESSION_MODES.join(', ')}`);
  }
  if (start_time >= end_time) {
    throw new ApiError(400, 'start_time must be before end_time');
  }

  const tutorProfile = await tutorProfileRepository.getById(tutor_id);
  if (!tutorProfile) throw new ApiError(404, 'Tutor not found');

  const targetModule = await moduleRepository.getById(module_id);
  if (!targetModule) throw new ApiError(404, 'Module not found');

  // Business rule 1: only verified tutor-module combinations are bookable.
  const verifiedModuleIds = await tutorVerificationRepository.listVerifiedModuleIdsForTutor(tutor_id);
  if (!verifiedModuleIds.includes(module_id)) {
    throw new ApiError(400, `This tutor is not verified for ${targetModule.module_code}`);
  }

  // Mode support check.
  if (session_mode === 'Physical' && !tutorProfile.physical_enabled) {
    throw new ApiError(400, 'This tutor does not offer physical sessions');
  }
  if (session_mode === 'Online' && !tutorProfile.online_enabled) {
    throw new ApiError(400, 'This tutor does not offer online sessions');
  }

  // Business rule 4: the requested time must sit inside declared availability.
  const availability = (await tutorAvailabilityRepository.listByTutor(tutor_id)).filter((a) => a.active !== false);
  const matchingSlot = availability.find((slot) => fitsWithinSlot(slot, { date, start_time, end_time, session_mode }));
  if (!matchingSlot) {
    throw new ApiError(400, 'The selected time is outside this tutor\'s availability');
  }

  const booking = await bookingRepository.create({
    id: idGen('booking'),
    student_id: studentId,
    tutor_id,
    module_id,
    topics: Array.isArray(topics) ? topics : (topics ? [topics] : []),
    date,
    start_time,
    end_time,
    session_type: session_type || 'Individual',
    session_mode: session_mode || (tutorProfile.online_enabled ? 'Online' : 'Physical'),
    student_message: student_message || '',
    status: 'Pending',
    decline_reason: null,
    created_date: new Date().toISOString(),
  });

  const student = await userRepository.getById(studentId);
  await notificationService.notify(tutorProfile.user_id, {
    type: 'BookingRequestReceived',
    title: 'New booking request',
    message: `${student?.full_name || 'A student'} requested a ${booking.session_type.toLowerCase()} session for ${targetModule.module_code} on ${date} at ${start_time}.`,
  });

  return booking;
}

/**
 * Detects whether accepting `booking` would clash with any session the tutor
 * has already committed to (spec section 20: prevent tutors from accepting
 * sessions that obviously conflict with an already accepted session).
 */
async function findConflictingSession(booking) {
  const existingSessions = await sessionRepository.listByTutor(booking.tutor_id);
  return existingSessions.find((s) =>
    s.date === booking.date &&
    ['Upcoming', 'In Progress'].includes(s.status) &&
    rangesOverlap(booking.start_time, booking.end_time, s.start_time, s.end_time)
  ) || null;
}

/**
 * Tutor accepts a booking: sets status Accepted, creates (or reuses) the
 * TutoringSession, registers the student as a participant so session chat
 * access resolves correctly, and notifies the student.
 */
async function acceptBooking(tutorUserId, bookingId) {
  const booking = await bookingRepository.getById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');

  const tutorProfile = await tutorProfileRepository.getByUserId(tutorUserId);
  if (!tutorProfile || tutorProfile.id !== booking.tutor_id) {
    throw new ApiError(403, 'You can only respond to your own booking requests');
  }
  if (booking.status !== 'Pending') {
    throw new ApiError(409, `This booking is already ${booking.status}`);
  }

  const conflict = await findConflictingSession(booking);
  if (conflict) {
    throw new ApiError(409, `This clashes with an existing session on ${conflict.date} at ${conflict.start_time}–${conflict.end_time}`);
  }

  const targetModule = await moduleRepository.getById(booking.module_id);

  let session = await sessionRepository.getByBooking(booking.id);
  if (!session) {
    session = await sessionRepository.create({
      id: idGen('session'),
      booking_id: booking.id,
      tutor_id: booking.tutor_id,
      module_id: booking.module_id,
      title: `${targetModule?.module_code || 'Session'} — ${(booking.topics || []).join(', ') || 'Tutoring session'}`,
      date: booking.date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      session_mode: booking.session_mode,
      location: booking.session_mode === 'Online' ? 'Online (in-app)' : 'To be confirmed with tutor',
      maximum_students: booking.session_type === 'Group' ? (tutorProfile.maximum_group_size || 1) : 1,
      status: 'Upcoming',
      start_timestamp: null,
      end_timestamp: null,
      attendance_verified: false,
      created_date: new Date().toISOString(),
    });

    await sessionParticipantRepository.create({
      id: idGen('participant'),
      session_id: session.id,
      student_id: booking.student_id,
      attendance_status: 'Registered',
      check_in_time: null,
      check_out_time: null,
      completion_confirmed: false,
    });
  }

  const updated = await bookingRepository.update(booking.id, { status: 'Accepted' });

  await notificationService.notify(booking.student_id, {
    type: 'BookingAccepted',
    title: 'Booking confirmed',
    message: `Your ${targetModule?.module_code || ''} session on ${booking.date} at ${booking.start_time} was accepted. Session chat is now open.`,
  });

  return { booking: updated, session };
}

/**
 * Tutor declines a booking with a reason, and the student is offered
 * alternative tutors for the same module/topics (spec section 12,
 * business rule 5).
 */
async function declineBooking(tutorUserId, bookingId, { decline_reason }) {
  if (!decline_reason || !DECLINE_REASONS.includes(decline_reason)) {
    throw new ApiError(400, `decline_reason must be one of ${DECLINE_REASONS.join(', ')}`);
  }

  const booking = await bookingRepository.getById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');

  const tutorProfile = await tutorProfileRepository.getByUserId(tutorUserId);
  if (!tutorProfile || tutorProfile.id !== booking.tutor_id) {
    throw new ApiError(403, 'You can only respond to your own booking requests');
  }
  if (booking.status !== 'Pending') {
    throw new ApiError(409, `This booking is already ${booking.status}`);
  }

  const updated = await bookingRepository.update(booking.id, {
    status: 'Declined',
    decline_reason,
  });

  const targetModule = await moduleRepository.getById(booking.module_id);
  await notificationService.notify(booking.student_id, {
    type: 'BookingDeclined',
    title: 'Booking declined',
    message: `Your ${targetModule?.module_code || ''} request on ${booking.date} was declined (${decline_reason}). We've suggested alternative tutors.`,
  });

  return updated;
}

/**
 * Alternative tutors for a declined booking — same module, same topics,
 * excluding the tutor who declined (business rule 5).
 */
async function getAlternatives(bookingId, requesterId) {
  const booking = await bookingRepository.getById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.student_id !== requesterId) {
    throw new ApiError(403, 'You can only view alternatives for your own bookings');
  }

  const results = await searchService.searchTutors({
    moduleId: booking.module_id,
    preferredTopics: booking.topics,
    preferredMode: booking.session_mode,
  });

  return results.filter((t) => t.tutor_profile_id !== booking.tutor_id);
}

/**
 * Student cancels their own booking. Only Pending or Accepted bookings that
 * haven't started yet are cancellable.
 */
async function cancelBooking(studentId, bookingId) {
  const booking = await bookingRepository.getById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.student_id !== studentId) {
    throw new ApiError(403, 'You can only cancel your own bookings');
  }
  if (!['Pending', 'Accepted'].includes(booking.status)) {
    throw new ApiError(409, `A ${booking.status} booking cannot be cancelled`);
  }

  const session = await sessionRepository.getByBooking(booking.id);
  if (session && session.status === 'In Progress') {
    throw new ApiError(409, 'This session has already started and cannot be cancelled');
  }
  if (session && session.status === 'Upcoming') {
    await sessionRepository.update(session.id, { status: 'Cancelled' });
  }

  const updated = await bookingRepository.update(booking.id, { status: 'Cancelled' });

  const tutorProfile = await tutorProfileRepository.getById(booking.tutor_id);
  if (tutorProfile) {
    await notificationService.notify(tutorProfile.user_id, {
      type: 'BookingCancelled',
      title: 'Booking cancelled',
      message: `A booking on ${booking.date} at ${booking.start_time} was cancelled by the student.`,
    });
  }

  return updated;
}

/** Hydrates a booking with module, session, and counterpart-user details for UI display. */
async function hydrateBooking(booking) {
  const [targetModule, session, tutorProfile, student] = await Promise.all([
    moduleRepository.getById(booking.module_id),
    sessionRepository.getByBooking(booking.id),
    tutorProfileRepository.getById(booking.tutor_id),
    userRepository.getById(booking.student_id),
  ]);
  const tutorUser = tutorProfile ? await userRepository.getById(tutorProfile.user_id) : null;

  return {
    ...booking,
    module: targetModule,
    session,
    tutor: tutorUser ? { tutor_profile_id: tutorProfile.id, user: sanitizeUser(tutorUser) } : null,
    student: sanitizeUser(student),
  };
}

async function listForStudent(studentId) {
  const bookings = await bookingRepository.listByStudent(studentId);
  const hydrated = await Promise.all(bookings.map(hydrateBooking));
  return hydrated.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
}

async function listForTutor(tutorUserId, { status } = {}) {
  const tutorProfile = await tutorProfileRepository.getByUserId(tutorUserId);
  if (!tutorProfile) return [];
  let bookings = await bookingRepository.listByTutor(tutorProfile.id);
  if (status) bookings = bookings.filter((b) => b.status === status);
  const hydrated = await Promise.all(bookings.map(hydrateBooking));
  return hydrated.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
}

async function getBookingForUser(bookingId, user) {
  const booking = await bookingRepository.getById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');

  if (user.role === 'Tutee' && booking.student_id !== user.id) {
    throw new ApiError(403, 'You do not have access to this booking');
  }
  if (user.role === 'Tutor') {
    const tutorProfile = await tutorProfileRepository.getByUserId(user.id);
    if (!tutorProfile || tutorProfile.id !== booking.tutor_id) {
      throw new ApiError(403, 'You do not have access to this booking');
    }
  }

  return hydrateBooking(booking);
}

module.exports = {
  createBooking,
  acceptBooking,
  declineBooking,
  cancelBooking,
  getAlternatives,
  listForStudent,
  listForTutor,
  getBookingForUser,
  findConflictingSession,
  BOOKING_STATUSES,
  DECLINE_REASONS,
};
