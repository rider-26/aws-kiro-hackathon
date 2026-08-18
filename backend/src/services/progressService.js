const quizAttemptRepository = require('../repositories/quizAttemptRepository');
const quizRepository = require('../repositories/quizRepository');
const moduleRepository = require('../repositories/moduleRepository');
const diagnosisService = require('./diagnosisService');

/**
 * A student's learning progress: attempt history, current per-topic standing,
 * and the improvement delta between their two most recent attempts.
 *
 * This is the read model behind the Progress page, the dashboard summary, and
 * (once permission is granted) the tutor's learning-summary view in Task 14.
 * It is always scoped to a single student id supplied by the caller, which for
 * self-serve routes is the authenticated user.
 */

async function getAttemptHistory(studentId) {
  const attempts = await quizAttemptRepository.listByStudent(studentId);
  const completed = attempts.filter((a) => a.status === 'Completed');

  const hydrated = await Promise.all(
    completed.map(async (a) => {
      const quiz = await quizRepository.getById(a.quiz_id);
      const moduleRecord = a.module_id || quiz?.module_id
        ? await moduleRepository.getById(a.module_id || quiz.module_id)
        : null;
      return {
        ...a,
        quiz_title: quiz?.title || 'Quiz',
        module: moduleRecord,
      };
    })
  );

  // Oldest first so charts read left-to-right chronologically.
  return hydrated.sort((a, b) => (a.completed_date || '').localeCompare(b.completed_date || ''));
}

/**
 * Latest vs previous attempt, plus the percentage-point delta between them.
 * Returns nulls rather than throwing when there isn't enough history yet, so
 * the dashboard can render a "take your first quiz" state.
 */
function computeImprovement(history) {
  if (history.length === 0) return { latest: null, previous: null, delta: null };
  const latest = history[history.length - 1];
  if (history.length === 1) return { latest, previous: null, delta: null };
  const previous = history[history.length - 2];
  return {
    latest,
    previous,
    delta: (latest.percentage || 0) - (previous.percentage || 0),
  };
}

async function getProgress(studentId, { moduleId } = {}) {
  const [history, topicPerformance] = await Promise.all([
    getAttemptHistory(studentId),
    diagnosisService.getTopicPerformance(studentId, moduleId),
  ]);

  const scoped = moduleId
    ? history.filter((a) => (a.module_id || a.module?.id) === moduleId)
    : history;

  const improvement = computeImprovement(scoped);

  const weak = topicPerformance.filter((t) => t.status === 'Needs Improvement');
  const developing = topicPerformance.filter((t) => t.status === 'Developing');
  const strong = topicPerformance.filter((t) => t.status === 'Strong');

  return {
    history: scoped,
    attempt_count: scoped.length,
    improvement,
    topic_performance: topicPerformance,
    weak_topics: weak,
    developing_topics: developing,
    strong_topics: strong,
  };
}

module.exports = { getProgress, getAttemptHistory, computeImprovement };
