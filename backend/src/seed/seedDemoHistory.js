/* eslint-disable no-console */
const idGen = require('../utils/idGen');
const quizRepository = require('../repositories/quizRepository');
const quizQuestionRepository = require('../repositories/quizQuestionRepository');
const quizAttemptRepository = require('../repositories/quizAttemptRepository');
const quizResponseRepository = require('../repositories/quizResponseRepository');
const studyMaterialRepository = require('../repositories/studyMaterialRepository');
const topicPerformanceRepository = require('../repositories/topicPerformanceRepository');
const { SAMPLE_MATERIAL, QUIZ_QUESTIONS } = require('../content/topic05Content');

/**
 * Seeds Jinyu's *historical* first quiz attempt so the dashboard and Progress
 * page have real "before" data on a fresh database.
 *
 * ── Why the topic percentages are seeded explicitly ──────────────────────
 * Spec sections 8 and 32 state the first attempt shows Digital Signatures 50%
 * and Certificates 40%. A 40% score is arithmetically impossible from the
 * two-questions-per-topic quiz (2 questions can only produce 0/50/100%), so
 * those exact figures are written directly onto the historical
 * TopicPerformance rows to match the specification.
 *
 * Live quizzes taken during the demo are never touched by this: they compute
 * honest percentages from the student's actual answers via diagnosisService.
 * This seed only supplies the prior-attempt baseline the improvement banner
 * measures against.
 */

// From the spec: 7/10 first attempt.
const FIRST_ATTEMPT_SCORE = 7;

// Exact figures required by the specification for the "before" state.
const SEEDED_TOPIC_PERFORMANCE = [
  { topic: 'Hashing', score_percentage: 100, status: 'Strong' },
  { topic: 'HMAC', score_percentage: 100, status: 'Strong' },
  { topic: 'RSA', score_percentage: 100, status: 'Strong' },
  { topic: 'Digital Signatures', score_percentage: 50, status: 'Needs Improvement' },
  { topic: 'Certificates', score_percentage: 40, status: 'Needs Improvement' },
];

/** Which of the ten seeded questions the student got right on attempt one. */
function firstAttemptCorrectness(question) {
  // Everything except the second signature question and both certificate
  // questions — giving 7/10 while leaving those two topics as the weak areas.
  if (question.topic === 'Certificates') return false;
  if (question.topic === 'Digital Signatures') {
    return question.question_text === QUIZ_QUESTIONS.find((q) => q.topic === 'Digital Signatures').question_text;
  }
  return true;
}

async function seedDemoHistory(users, modules) {
  const jinyu = users['jinyu@student.demo'];
  const it2513 = modules.IT2513;
  if (!jinyu || !it2513) {
    console.log('  skipped: Jinyu or IT2513 not found');
    return null;
  }

  // Idempotency: if Jinyu already has a completed attempt, leave history alone.
  const existingAttempts = await quizAttemptRepository.listByStudent(jinyu.id);
  if (existingAttempts.some((a) => a.status === 'Completed')) {
    console.log('  skipped: quiz history already present');
    return null;
  }

  // --- Sample study material ---
  const existingMaterials = await studyMaterialRepository.listByStudent(jinyu.id);
  let material = existingMaterials.find((m) => m.is_sample);
  if (!material) {
    material = await studyMaterialRepository.create({
      id: idGen('material'),
      student_id: jinyu.id,
      module_id: it2513.id,
      filename: SAMPLE_MATERIAL.filename,
      file_reference: null,
      page_count: SAMPLE_MATERIAL.page_count,
      description: SAMPLE_MATERIAL.description,
      topics: SAMPLE_MATERIAL.topics,
      is_sample: true,
      uploaded_date: new Date(Date.now() - 9 * 86400000).toISOString(),
    });
  }
  console.log(`  material: ${material.filename}`);

  // --- The quiz itself ---
  const quiz = await quizRepository.create({
    id: idGen('quiz'),
    student_id: jinyu.id,
    study_material_id: material.id,
    module_id: it2513.id,
    title: `${it2513.module_code} — Topic05_DigitalSignatures`,
    question_count: QUIZ_QUESTIONS.length,
    // Historical data, so it came from the curated bank rather than a live call.
    source: 'fallback',
    fallback_reason: 'Seeded demo history',
    created_date: new Date(Date.now() - 8 * 86400000).toISOString(),
  });

  const questions = await Promise.all(
    QUIZ_QUESTIONS.map((q, index) =>
      quizQuestionRepository.create({
        id: idGen('question'),
        quiz_id: quiz.id,
        order: index + 1,
        ...q,
      })
    )
  );
  console.log(`  quiz: ${quiz.title} (${questions.length} questions)`);

  // --- The completed first attempt (7/10) ---
  const completedDate = new Date(Date.now() - 7 * 86400000).toISOString();
  const attempt = await quizAttemptRepository.create({
    id: idGen('attempt'),
    quiz_id: quiz.id,
    student_id: jinyu.id,
    module_id: it2513.id,
    score: FIRST_ATTEMPT_SCORE,
    total_questions: questions.length,
    percentage: Math.round((FIRST_ATTEMPT_SCORE / questions.length) * 100),
    status: 'Completed',
    started_date: completedDate,
    completed_date: completedDate,
  });

  let recordedCorrect = 0;
  for (const question of questions) {
    const correct = firstAttemptCorrectness(question) && recordedCorrect < FIRST_ATTEMPT_SCORE;
    if (correct) recordedCorrect += 1;
    await quizResponseRepository.create({
      id: idGen('response'),
      attempt_id: attempt.id,
      question_id: question.id,
      selected_answer: correct ? question.correct_answer : 'A',
      correct,
      topic: question.topic,
    });
  }
  console.log(`  attempt: ${attempt.score}/${attempt.total_questions} (${attempt.percentage}%)`);

  // --- Topic performance with the spec's exact "before" figures ---
  const existingPerf = await topicPerformanceRepository.listByStudentAndModule(jinyu.id, it2513.id);
  const byTopic = new Map(existingPerf.map((row) => [row.topic, row]));

  for (const entry of SEEDED_TOPIC_PERFORMANCE) {
    if (byTopic.has(entry.topic)) continue;
    await topicPerformanceRepository.create({
      id: idGen('topicperf'),
      student_id: jinyu.id,
      module_id: it2513.id,
      topic: entry.topic,
      score_percentage: entry.score_percentage,
      status: entry.status,
      updated_date: completedDate,
    });
    console.log(`  topic: ${entry.topic} ${entry.score_percentage}% (${entry.status})`);
  }

  return { quiz, attempt, material };
}

module.exports = { seedDemoHistory, SEEDED_TOPIC_PERFORMANCE, FIRST_ATTEMPT_SCORE };
