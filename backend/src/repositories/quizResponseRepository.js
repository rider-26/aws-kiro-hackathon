const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.quizResponses);

async function listByAttempt(attempt_id) {
  return base.queryByIndex('attemptId-index', 'attempt_id = :aid', { ':aid': attempt_id });
}

module.exports = { ...base, listByAttempt };
