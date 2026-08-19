/* eslint-disable no-console */
/**
 * Live check of the DeepSeek quiz-generation integration.
 *
 * Run with: npm run smoke:deepseek
 *
 * Requires DEEPSEEK_API_KEY in backend/.env. If the key is absent this script
 * reports that clearly and exits non-zero — it deliberately does NOT pass by
 * silently falling back, because the point of this script is to prove the real
 * API path works. (The application itself does fall back, by design.)
 */
require('dotenv').config();
const env = require('../src/config/env');
const deepseekService = require('../src/services/deepseekService');

const TOPICS = ['Hashing', 'HMAC', 'RSA', 'Digital Signatures', 'Certificates'];

async function main() {
  if (!env.deepseek.apiKey) {
    console.error('FAIL: DEEPSEEK_API_KEY is not set in backend/.env.');
    console.error('      Add it, then re-run. The app will still work without it,');
    console.error('      but quizzes will come from the seeded question bank.');
    process.exit(1);
  }

  console.log(`Calling ${env.deepseek.apiUrl} with model ${env.deepseek.model}…`);
  const started = Date.now();

  let questions;
  try {
    questions = await deepseekService.requestQuestions({
      moduleCode: 'IT2513',
      materialName: 'Topic05_DigitalSignatures.pdf',
      topics: TOPICS,
      questionCount: 10,
      pageCount: 28,
    });
  } catch (err) {
    console.error(`FAIL: live generation failed — ${err.message}`);
    process.exit(1);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`PASS: received ${questions.length} valid questions in ${elapsed}s`);

  let failures = 0;

  if (questions.length !== 10) {
    console.error(`FAIL: expected 10 questions, got ${questions.length}`);
    failures += 1;
  }

  const offTopic = questions.filter((q) => !TOPICS.includes(q.topic));
  if (offTopic.length > 0) {
    console.error(`FAIL: ${offTopic.length} question(s) had an unexpected topic`);
    failures += 1;
  } else {
    console.log('PASS: every question is tagged with a requested topic');
  }

  const malformed = questions.filter((q) =>
    !['A', 'B', 'C', 'D'].includes(q.correct_answer) ||
    !q.option_a || !q.option_b || !q.option_c || !q.option_d ||
    !q.explanation || !Number.isInteger(q.source_page)
  );
  if (malformed.length > 0) {
    console.error(`FAIL: ${malformed.length} question(s) were malformed after validation`);
    failures += 1;
  } else {
    console.log('PASS: every question has four options, a valid answer, an explanation and a page');
  }

  const topicsCovered = new Set(questions.map((q) => q.topic));
  console.log(`INFO: topics covered — ${[...topicsCovered].join(', ')}`);
  console.log('\nSample question:');
  console.log(`  [${questions[0].topic}] ${questions[0].question_text}`);
  console.log(`  A. ${questions[0].option_a}`);
  console.log(`  B. ${questions[0].option_b}`);
  console.log(`  C. ${questions[0].option_c}`);
  console.log(`  D. ${questions[0].option_d}`);
  console.log(`  Correct: ${questions[0].correct_answer} (page ${questions[0].source_page})`);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nDeepSeek integration is working.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
