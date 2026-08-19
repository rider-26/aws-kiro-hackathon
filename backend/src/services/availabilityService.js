const idGen = require('../utils/idGen');
const tutorAvailabilityRepository = require('../repositories/tutorAvailabilityRepository');
const tutorService = require('./tutorService');
const { ApiError } = require('../middleware/errorHandler');

const VALID_MODES = ['Physical', 'Online', 'Both'];

async function addSlot(userId, { day_or_date, start_time, end_time, repeating, session_mode }) {
  if (!day_or_date || !start_time || !end_time) {
    throw new ApiError(400, 'day_or_date, start_time and end_time are required');
  }
  if (session_mode && !VALID_MODES.includes(session_mode)) {
    throw new ApiError(400, `session_mode must be one of ${VALID_MODES.join(', ')}`);
  }
  if (start_time >= end_time) {
    throw new ApiError(400, 'start_time must be before end_time');
  }

  const profile = await tutorService.ensureProfileForUser(userId);
  return tutorAvailabilityRepository.create({
    id: idGen('availability'),
    tutor_id: profile.id,
    day_or_date,
    start_time,
    end_time,
    repeating: repeating !== false,
    session_mode: session_mode || 'Both',
    active: true,
  });
}

async function updateSlot(userId, slotId, patch) {
  const profile = await tutorService.ensureProfileForUser(userId);
  const slot = await tutorAvailabilityRepository.getById(slotId);
  if (!slot || slot.tutor_id !== profile.id) {
    throw new ApiError(404, 'Availability slot not found');
  }
  const EDITABLE = ['day_or_date', 'start_time', 'end_time', 'repeating', 'session_mode', 'active'];
  const safePatch = {};
  for (const key of EDITABLE) {
    if (patch[key] !== undefined) safePatch[key] = patch[key];
  }
  return tutorAvailabilityRepository.update(slotId, safePatch);
}

async function removeSlot(userId, slotId) {
  const profile = await tutorService.ensureProfileForUser(userId);
  const slot = await tutorAvailabilityRepository.getById(slotId);
  if (!slot || slot.tutor_id !== profile.id) {
    throw new ApiError(404, 'Availability slot not found');
  }
  await tutorAvailabilityRepository.remove(slotId);
}

async function listOwn(userId) {
  const profile = await tutorService.ensureProfileForUser(userId);
  return tutorAvailabilityRepository.listByTutor(profile.id);
}

module.exports = { addSlot, updateSlot, removeSlot, listOwn };
