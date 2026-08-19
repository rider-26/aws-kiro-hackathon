const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.sessions);

async function listByTutor(tutor_id) {
  return base.queryByIndex('tutorId-index', 'tutor_id = :tid', { ':tid': tutor_id });
}

async function listByBooking(booking_id) {
  return base.queryByIndex('bookingId-index', 'booking_id = :bid', { ':bid': booking_id });
}

async function getByBooking(booking_id) {
  const items = await listByBooking(booking_id);
  return items[0] || null;
}

module.exports = { ...base, listByTutor, listByBooking, getByBooking };
