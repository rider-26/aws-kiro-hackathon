const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.quizAttempts);

async function listByQuiz(quiz_id) {
  return base.queryByIndex('quizId-index', 'quiz_id = :qid', { ':qid': quiz_id });
}

async function listByStudent(student_id) {
  return base.queryByIndex('studentId-index', 'student_id = :sid', { ':sid': student_id });
}

module.exports = { ...base, listByQuiz, listByStudent };
