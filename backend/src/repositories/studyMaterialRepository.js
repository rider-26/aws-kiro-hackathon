const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.studyMaterials);

async function listByStudent(student_id) {
  return base.queryByIndex('studentId-index', 'student_id = :sid', { ':sid': student_id });
}

module.exports = { ...base, listByStudent };
