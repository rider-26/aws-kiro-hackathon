const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.topicPerformance);

/**
 * All topic performance rows for a student, optionally narrowed to one module.
 * GSI is `studentId-moduleId-index` (PK: student_id, SK: module_id).
 */
async function listByStudent(student_id) {
  return base.queryByIndex('studentId-moduleId-index', 'student_id = :sid', { ':sid': student_id });
}

async function listByStudentAndModule(student_id, module_id) {
  return base.queryByIndex(
    'studentId-moduleId-index',
    'student_id = :sid AND module_id = :mid',
    { ':sid': student_id, ':mid': module_id }
  );
}

module.exports = { ...base, listByStudent, listByStudentAndModule };
