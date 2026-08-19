const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.reviews);

async function listBySession(session_id) {
  return base.queryByIndex('sessionId-index', 'session_id = :sid', { ':sid': session_id });
}

async function listByTutor(tutor_id) {
  return base.queryByIndex('tutorId-index', 'tutor_id = :tid', { ':tid': tutor_id });
}

module.exports = { ...base, listBySession, listByTutor };
