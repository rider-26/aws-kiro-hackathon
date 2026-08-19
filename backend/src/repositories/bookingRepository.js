const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.bookings);

async function listByStudent(student_id) {
  return base.queryByIndex('studentId-index', 'student_id = :sid', { ':sid': student_id });
}

async function listByTutor(tutor_id) {
  return base.queryByIndex('tutorId-index', 'tutor_id = :tid', { ':tid': tutor_id });
}

module.exports = { ...base, listByStudent, listByTutor };
