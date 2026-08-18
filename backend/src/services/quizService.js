const idGen = require('../utils/idGen');
const quizRepository = require('../repositories/quizRepository');
const quizQuestionRepository = require('../repositories/quizQuestionRepository');
const quizAttemptRepository = require('../repositories/quizAttemptRepository');
const quizResponseRepository = require('../repositories/quizResponseRepository');
const moduleRepository = require('../repositories/moduleRepository');
const studyService = require('./studyService');
const deepseekService = require('./deepseekService');
const diagnosisService = require('./diagnosisService');
const { SAMPLE_MATERIAL } = require('../content/topic05Content');
const { ApiError } = require('../middleware/errorHandler');

const DEFAULT_QUESTION_COUNT = 10;

/**
 * Quiz generation, delivery and scoring (spec sections 16 & 17).
 *
 * Privacy: a student's quizzes, questions, attempts and responses are only
 * ever reachable through functions that verify `student_id` matches the
 * authenticated user (business rule 9 — learning data is private by default,
 * and no tutee can see another student's quiz information).
 */

/** Strips the answer key so an in-progress quiz can't be cheated from the payload. */
function toClientQuestion(q, { includeAnswer = false } = {}) {
  const base = {
    id: q.id,
    quiz_id: q.quiz_id,
    topic: q.topic,
    question_text: q.question_text,
    answer_type: q.answer_type,
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c,
    option_d: q.option_d,
    order: q.order,
  };
  if (includeAnswer) {
    base.correct_answer = q.correct_answer;
    base.explanation = q.explanation;
    base.source_page = q.source_page;
  }
  return base;
}

/**
 * Generates a quiz for one of the student's own study materials.
 *
 * Calls DeepSeek for real; falls back to the seeded IT2513 bank if that call
 * fails, and records which path was used on the quiz row.
 */
async function generateQuiz(studentId, { study_material_id, question_count }) {
  const material = await studyService.getOwnMaterial(studentId, study_material_id);
  const count = Math.min(Math.max(Number(question_count) || DEFAULT_QUESTION_COUNT, 4), 15);

  const moduleRecord = material.module_id ? await moduleRepository.getById(material.module_id) : null;
  const topics = material.topics && material.topics.length ? material.topics : SAMPLE_MATERIAL.topics;

  const { questions, source, fallback_reason } = await deepseekService.generateQuestions({
    moduleCode: moduleRecord?.module_code || 'IT2513',
    materialName: material.filename,
    topics,
    questionCount: count,
    pageCount: material.page_count || SAMPLE_MATERIAL.page_count,
  });

  const quiz = await quizRepository.create({
    id: idGen('quiz'),
    student_id: studentId,
    study_material_id: material.id,
    module_id: material.module_id || (moduleRecord ? moduleRecord.id : null),
    title: `${moduleRecord?.module_code || 'Quiz'} — ${material.filename.replace(/\.[^.]+$/, '')}`,
    question_count: questions.length,
    source, // 'deepseek' | 'fallback' — surfaced in the UI, never hidden
    fallback_reason: fallback_reason || null,
    created_date: new Date().toISOString(),
  });

  const stored = await Promise.all(
    questions.map((q, index) =>
      quizQuestionRepository.create({
        id: idGen('question'),
        quiz_id: quiz.id,
        order: index + 1,
        topic: q.topic,
        question_text: q.question_text,
        answer_type: q.answer_type || 'multiple_choice',
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        source_page: q.source_page,
      })
    )
  );

  return { quiz, questions: stored.map((q) => toClientQuestion(q)) };
}

/** A quiz the student owns, with answer-free questions for taking it. */
async function getQuizForStudent(studentId, quizId) {
  const quiz = await quizRepository.getById(quizId);
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  if (quiz.student_id !== studentId) {
    throw new ApiError(403, 'You do not have access to this quiz');
  }

  const questions = await quizQuestionRepository.listByQuiz(quizId);
  questions.sort((a, b) => (a.order || 0) - (b.order || 0));

  return { quiz, questions: questions.map((q) => toClientQuestion(q)) };
}

/**
 * Grades a single answer immediately so the player can show correct/incorrect,
 * the correct answer, the explanation and the page to review (spec section 16).
 * The response row is persisted here so a partially completed quiz still has
 * a record, and the final attempt aggregates them.
 */
async function gradeAnswer(studentId, quizId, { question_id, selected_answer, attempt_id }) {
  const quiz = await quizRepository.getById(quizId);
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  if (quiz.student_id !== studentId) {
    throw new ApiError(403, 'You do not have access to this quiz');
  }

  const question = await quizQuestionRepository.getById(question_id);
  if (!question || question.quiz_id !== quizId) {
    throw new ApiError(404, 'Question not found on this quiz');
  }

  const selected = String(selected_answer || '').trim().toUpperCase();
  const correct = selected === question.correct_answer;

  if (attempt_id) {
    const attempt = await quizAttemptRepository.getById(attempt_id);
    if (attempt && attempt.student_id === studentId) {
      await quizResponseRepository.create({
        id: idGen('response'),
        attempt_id,
        question_id: question.id,
        selected_answer: selected,
        correct,
        topic: question.topic,
      });
    }
  }

  return {
    correct,
    correct_answer: question.correct_answer,
    explanation: question.explanation,
    source_page: question.source_page,
    topic: question.topic,
  };
}

/** Starts an attempt so per-question responses can be attributed to it. */
async function startAttempt(studentId, quizId) {
  const quiz = await quizRepository.getById(quizId);
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  if (quiz.student_id !== studentId) {
    throw new ApiError(403, 'You do not have access to this quiz');
  }

  const questions = await quizQuestionRepository.listByQuiz(quizId);

  return quizAttemptRepository.create({
    id: idGen('attempt'),
    quiz_id: quizId,
    student_id: studentId,
    module_id: quiz.module_id,
    score: 0,
    total_questions: questions.length,
    percentage: 0,
    status: 'In Progress',
    started_date: new Date().toISOString(),
    completed_date: null,
  });
}

/**
 * Submits a full set of answers, scores them, and finalises the attempt.
 *
 * `answers` is a map of question_id -> selected option letter. Scoring is done
 * entirely server-side against the stored answer key; the client's own view of
 * correctness is never trusted.
 */
async function submitAttempt(studentId, quizId, { attempt_id, answers }) {
  const quiz = await quizRepository.getById(quizId);
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  if (quiz.student_id !== studentId) {
    throw new ApiError(403, 'You do not have access to this quiz');
  }
  if (!answers || typeof answers !== 'object') {
    throw new ApiError(400, 'answers must be an object of question_id to selected option');
  }

  const questions = await quizQuestionRepository.listByQuiz(quizId);
  if (questions.length === 0) throw new ApiError(400, 'This quiz has no questions');

  let attempt;
  if (attempt_id) {
    attempt = await quizAttemptRepository.getById(attempt_id);
    if (!attempt || attempt.student_id !== studentId || attempt.quiz_id !== quizId) {
      throw new ApiError(404, 'Attempt not found for this quiz');
    }
    if (attempt.status === 'Completed') {
      throw new ApiError(409, 'This attempt has already been submitted');
    }
  } else {
    attempt = await startAttempt(studentId, quizId);
  }

  // Replace any per-question rows recorded during the run so the attempt has
  // exactly one authoritative response per question.
  const existing = await quizResponseRepository.listByAttempt(attempt.id);
  await Promise.all(existing.map((r) => quizResponseRepository.remove(r.id)));

  let score = 0;
  const responses = [];

  for (const question of questions) {
    const selected = String(answers[question.id] || '').trim().toUpperCase();
    const correct = selected === question.correct_answer;
    if (correct) score += 1;

    responses.push(
      await quizResponseRepository.create({
        id: idGen('response'),
        attempt_id: attempt.id,
        question_id: question.id,
        selected_answer: selected || null,
        correct,
        topic: question.topic,
      })
    );
  }

  const percentage = Math.round((score / questions.length) * 100);

  const finalised = await quizAttemptRepository.update(attempt.id, {
    score,
    total_questions: questions.length,
    percentage,
    status: 'Completed',
    completed_date: new Date().toISOString(),
  });

  // Diagnosis runs as part of submission so TopicPerformance is always in step
  // with the latest completed attempt — the dashboard, progress page and tutor
  // matching all read from those rows.
  const diagnosis = await diagnosisService.diagnose({
    studentId,
    moduleId: quiz.module_id,
    attempt: finalised,
    responses,
    questions,
  });

  return { attempt: finalised, responses, questions, diagnosis };
}

/**
 * Recomputes the diagnosis for an already-completed attempt, so the result page
 * can be revisited (or deep-linked) without re-submitting.
 */
async function getDiagnosisForAttempt(studentId, attemptId) {
  const attempt = await quizAttemptRepository.getById(attemptId);
  if (!attempt) throw new ApiError(404, 'Attempt not found');
  if (attempt.student_id !== studentId) {
    throw new ApiError(403, 'You do not have access to this attempt');
  }

  const [responses, questions, quiz] = await Promise.all([
    quizResponseRepository.listByAttempt(attemptId),
    quizQuestionRepository.listByQuiz(attempt.quiz_id),
    quizRepository.getById(attempt.quiz_id),
  ]);

  const breakdown = diagnosisService.computeTopicBreakdown(responses);
  const recommended_pages = diagnosisService.computeRecommendedPages(responses, questions);

  return {
    attempt,
    quiz,
    diagnosis: {
      attempt_id: attempt.id,
      module_id: attempt.module_id || quiz?.module_id || null,
      score: attempt.score,
      total_questions: attempt.total_questions,
      percentage: attempt.percentage,
      overall_status: diagnosisService.classify(attempt.percentage || 0),
      breakdown,
      strong: breakdown.filter((b) => b.status === diagnosisService.STATUS.STRONG),
      developing: breakdown.filter((b) => b.status === diagnosisService.STATUS.DEVELOPING),
      needs_improvement: breakdown.filter((b) => b.status === diagnosisService.STATUS.NEEDS_IMPROVEMENT),
      weak_topics: breakdown
        .filter((b) => b.status === diagnosisService.STATUS.NEEDS_IMPROVEMENT)
        .map((b) => b.topic),
      recommended_pages,
    },
  };
}

async function listOwnQuizzes(studentId) {
  const quizzes = await quizRepository.listByStudent(studentId);
  const withAttempts = await Promise.all(
    quizzes.map(async (q) => {
      const attempts = await quizAttemptRepository.listByQuiz(q.id);
      const completed = attempts
        .filter((a) => a.status === 'Completed')
        .sort((a, b) => (b.completed_date || '').localeCompare(a.completed_date || ''));
      return { ...q, attempt_count: completed.length, latest_attempt: completed[0] || null };
    })
  );
  return withAttempts.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
}

/** Attempt detail with the answer key revealed, for the results/review screen. */
async function getAttemptForStudent(studentId, attemptId) {
  const attempt = await quizAttemptRepository.getById(attemptId);
  if (!attempt) throw new ApiError(404, 'Attempt not found');
  if (attempt.student_id !== studentId) {
    throw new ApiError(403, 'You do not have access to this attempt');
  }

  const [responses, questions, quiz] = await Promise.all([
    quizResponseRepository.listByAttempt(attemptId),
    quizQuestionRepository.listByQuiz(attempt.quiz_id),
    quizRepository.getById(attempt.quiz_id),
  ]);

  const byQuestion = new Map(responses.map((r) => [r.question_id, r]));
  const reviewed = questions
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((q) => ({
      ...toClientQuestion(q, { includeAnswer: true }),
      response: byQuestion.get(q.id) || null,
    }));

  return { attempt, quiz, questions: reviewed };
}

module.exports = {
  generateQuiz,
  getQuizForStudent,
  gradeAnswer,
  startAttempt,
  submitAttempt,
  getDiagnosisForAttempt,
  listOwnQuizzes,
  getAttemptForStudent,
  toClientQuestion,
  DEFAULT_QUESTION_COUNT,
};
