const idGen = require('../utils/idGen');
const topicPerformanceRepository = require('../repositories/topicPerformanceRepository');

/**
 * Quiz diagnosis (spec section 17).
 *
 * Turns a completed attempt's per-question responses into per-topic
 * percentages, classifies each topic, persists TopicPerformance, and produces
 * the weak-topic list that drives tutor matching. The classification
 * thresholds are exactly as specified:
 *
 *   80–100  -> Strong
 *   60–79   -> Developing
 *   below 60 -> Needs Improvement
 */

const STATUS = {
  STRONG: 'Strong',
  DEVELOPING: 'Developing',
  NEEDS_IMPROVEMENT: 'Needs Improvement',
};

/** Pure classifier for a topic percentage. */
function classify(percentage) {
  if (percentage >= 80) return STATUS.STRONG;
  if (percentage >= 60) return STATUS.DEVELOPING;
  return STATUS.NEEDS_IMPROVEMENT;
}

/**
 * Groups responses by topic and computes each topic's score.
 *
 * @param {Array} responses - QuizResponse rows ({ topic, correct })
 * @returns {Array} [{ topic, correct, total, score_percentage, status }] sorted
 *          weakest-first so the UI and tutor matching naturally prioritise gaps.
 */
function computeTopicBreakdown(responses) {
  const byTopic = new Map();

  for (const r of responses) {
    const topic = r.topic || 'General';
    if (!byTopic.has(topic)) byTopic.set(topic, { topic, correct: 0, total: 0 });
    const entry = byTopic.get(topic);
    entry.total += 1;
    if (r.correct) entry.correct += 1;
  }

  return [...byTopic.values()]
    .map((entry) => {
      const score_percentage = entry.total === 0 ? 0 : Math.round((entry.correct / entry.total) * 100);
      return { ...entry, score_percentage, status: classify(score_percentage) };
    })
    .sort((a, b) => a.score_percentage - b.score_percentage || a.topic.localeCompare(b.topic));
}

/**
 * Pages worth re-reading, derived from the questions the student got wrong.
 * Returned as a per-topic map so the UI can say "review pages 18, 19 for
 * Digital Signatures" rather than an undifferentiated page list.
 */
function computeRecommendedPages(responses, questions) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const byTopic = new Map();

  for (const r of responses) {
    if (r.correct) continue;
    const question = byId.get(r.question_id);
    if (!question || !question.source_page) continue;
    const topic = question.topic || r.topic || 'General';
    if (!byTopic.has(topic)) byTopic.set(topic, new Set());
    byTopic.get(topic).add(question.source_page);
  }

  return [...byTopic.entries()].map(([topic, pages]) => ({
    topic,
    pages: [...pages].sort((a, b) => a - b),
  }));
}

/**
 * Writes the breakdown to TopicPerformance, one row per
 * (student, module, topic) — updating the existing row when there is one so the
 * table always reflects the student's latest known standing per topic.
 */
async function persistTopicPerformance(studentId, moduleId, breakdown) {
  if (!moduleId) return [];

  const existing = await topicPerformanceRepository.listByStudentAndModule(studentId, moduleId);
  const byTopic = new Map(existing.map((row) => [row.topic, row]));
  const now = new Date().toISOString();

  return Promise.all(
    breakdown.map(async (entry) => {
      const current = byTopic.get(entry.topic);
      if (current) {
        return topicPerformanceRepository.update(current.id, {
          score_percentage: entry.score_percentage,
          status: entry.status,
          updated_date: now,
        });
      }
      return topicPerformanceRepository.create({
        id: idGen('topicperf'),
        student_id: studentId,
        module_id: moduleId,
        topic: entry.topic,
        score_percentage: entry.score_percentage,
        status: entry.status,
        updated_date: now,
      });
    })
  );
}

/**
 * Builds the full diagnosis for a completed attempt and persists the topic
 * performance rows.
 *
 * @returns diagnosis object consumed directly by the result page
 */
async function diagnose({ studentId, moduleId, attempt, responses, questions }) {
  const breakdown = computeTopicBreakdown(responses);
  const recommended_pages = computeRecommendedPages(responses, questions);

  const strong = breakdown.filter((b) => b.status === STATUS.STRONG);
  const developing = breakdown.filter((b) => b.status === STATUS.DEVELOPING);
  const needs_improvement = breakdown.filter((b) => b.status === STATUS.NEEDS_IMPROVEMENT);

  await persistTopicPerformance(studentId, moduleId, breakdown);

  return {
    attempt_id: attempt.id,
    module_id: moduleId,
    score: attempt.score,
    total_questions: attempt.total_questions,
    percentage: attempt.percentage,
    overall_status: classify(attempt.percentage),
    breakdown,
    strong,
    developing,
    needs_improvement,
    // Ordered weakest-first: this is exactly what the Find a Tutor deep link
    // passes as `weakTopics` so matching prioritises the biggest gaps.
    weak_topics: needs_improvement.map((b) => b.topic),
    recommended_pages,
  };
}

/** Current standing per topic for a student, newest updates first. */
async function getTopicPerformance(studentId, moduleId) {
  const rows = moduleId
    ? await topicPerformanceRepository.listByStudentAndModule(studentId, moduleId)
    : await topicPerformanceRepository.listByStudent(studentId);

  return rows.sort((a, b) => (a.score_percentage || 0) - (b.score_percentage || 0));
}

module.exports = {
  classify,
  computeTopicBreakdown,
  computeRecommendedPages,
  persistTopicPerformance,
  diagnose,
  getTopicPerformance,
  STATUS,
};
