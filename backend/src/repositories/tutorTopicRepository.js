const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.tutorTopics);

async function listByTutor(tutor_id) {
  return base.queryByIndex('tutorId-index', 'tutor_id = :tid', { ':tid': tutor_id });
}

module.exports = { ...base, listByTutor };
