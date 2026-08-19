const quizService = require('../services/quizService');
const { ok, created } = require('../utils/response');

async function listQuizzes(req, res, next) {
  try {
    const quizzes = await quizService.listOwnQuizzes(req.user.id);
    return ok(res, { quizzes });
  } catch (err) {
    return next(err);
  }
}

async function generateQuiz(req, res, next) {
  try {
    const result = await quizService.generateQuiz(req.user.id, req.body);
    return created(res, result);
  } catch (err) {
    return next(err);
  }
}

async function getQuiz(req, res, next) {
  try {
    const result = await quizService.getQuizForStudent(req.user.id, req.params.id);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

async function startAttempt(req, res, next) {
  try {
    const attempt = await quizService.startAttempt(req.user.id, req.params.id);
    return created(res, { attempt });
  } catch (err) {
    return next(err);
  }
}

async function gradeAnswer(req, res, next) {
  try {
    const result = await quizService.gradeAnswer(req.user.id, req.params.id, req.body);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

async function submitAttempt(req, res, next) {
  try {
    const result = await quizService.submitAttempt(req.user.id, req.params.id, req.body);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

async function getAttempt(req, res, next) {
  try {
    const result = await quizService.getAttemptForStudent(req.user.id, req.params.attemptId);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

async function getDiagnosis(req, res, next) {
  try {
    const result = await quizService.getDiagnosisForAttempt(req.user.id, req.params.attemptId);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listQuizzes,
  generateQuiz,
  getQuiz,
  startAttempt,
  gradeAnswer,
  submitAttempt,
  getAttempt,
  getDiagnosis,
};
