const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.sessionParticipants);

async function listBySession(session_id) {
  return base.queryByIndex('sessionId-index', 'session_id = :sid', { ':sid': session_id });
}

async function listByStudent(student_id) {
  return base.queryByIndex('studentId-index', 'student_id = :stid', { ':stid': student_id });
}

module.exports = { ...base, listBySession, listByStudent };
