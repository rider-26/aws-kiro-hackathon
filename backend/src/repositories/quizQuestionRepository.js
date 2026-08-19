const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.quizQuestions);

async function listByQuiz(quiz_id) {
  return base.queryByIndex('quizId-index', 'quiz_id = :qid', { ':qid': quiz_id });
}

module.exports = { ...base, listByQuiz };
