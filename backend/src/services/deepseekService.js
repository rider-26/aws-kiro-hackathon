const env = require('../config/env');
const { QUIZ_QUESTIONS } = require('../content/topic05Content');

/**
 * DeepSeek integration for quiz generation.
 *
 * This is a REAL external API call (spec section 33: quiz generation is the
 * one AI feature that is genuinely integrated, not simulated). The seeded
 * IT2513 question bank is used ONLY as a fallback when the live call cannot
 * be completed or returns unusable output, so the demo journey never breaks
 * because of network, quota or parsing problems.
 *
 * Every quiz records which path produced it (`source`), and the UI surfaces
 * that distinction rather than pretending everything came from the model.
 */

const REQUEST_TIMEOUT_MS = 25000;
const VALID_ANSWERS = ['A', 'B', 'C', 'D'];

function buildPrompt({ moduleCode, materialName, topics, questionCount, pageCount }) {
  const topicList = topics && topics.length ? topics.join(', ') : 'the key concepts of the material';
  return [
    `You are helping a Nanyang Polytechnic student revise for the module ${moduleCode}.`,
    `They uploaded study material titled "${materialName}"${pageCount ? ` (${pageCount} pages)` : ''}.`,
    `Write exactly ${questionCount} multiple-choice revision questions covering these topics: ${topicList}.`,
    '',
    'Rules:',
    '- Distribute questions as evenly as possible across the listed topics.',
    '- Each question must have exactly four options and exactly one correct answer.',
    '- "topic" must be one of the listed topics, copied verbatim.',
    '- "correct_answer" must be one of "A", "B", "C", "D".',
    '- "explanation" must be one or two sentences explaining why the answer is correct.',
    `- "source_page" must be a plausible page number between 1 and ${pageCount || 30}.`,
    '',
    'Respond with ONLY a JSON object in exactly this shape, no markdown fences, no commentary:',
    '{"questions":[{"topic":"...","question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer":"B","explanation":"...","source_page":18}]}',
  ].join('\n');
}

/**
 * Extracts a JSON object from a model response, tolerating markdown fences or
 * surrounding prose that some models add despite instructions.
 */
function extractJson(text) {
  if (!text) throw new Error('Empty response body');
  const withoutFences = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in response');
  }
  return JSON.parse(withoutFences.slice(start, end + 1));
}

/**
 * Validates and normalizes model output. Anything malformed is rejected so a
 * broken question can never reach a student mid-quiz.
 */
function normalizeQuestions(raw, { allowedTopics, questionCount }) {
  if (!raw || !Array.isArray(raw.questions)) {
    throw new Error('Response did not contain a questions array');
  }

  const normalized = raw.questions
    .map((q) => {
      const correct = String(q.correct_answer || '').trim().toUpperCase();
      const page = Number.parseInt(q.source_page, 10);

      const question = {
        topic: String(q.topic || '').trim(),
        question_text: String(q.question_text || '').trim(),
        answer_type: 'multiple_choice',
        option_a: String(q.option_a || '').trim(),
        option_b: String(q.option_b || '').trim(),
        option_c: String(q.option_c || '').trim(),
        option_d: String(q.option_d || '').trim(),
        correct_answer: correct,
        explanation: String(q.explanation || '').trim(),
        source_page: Number.isFinite(page) && page > 0 ? page : 1,
      };

      const complete =
        question.topic &&
        question.question_text &&
        question.option_a && question.option_b && question.option_c && question.option_d &&
        VALID_ANSWERS.includes(question.correct_answer) &&
        question.explanation;

      if (!complete) return null;

      // Keep topics inside the requested set so downstream topic diagnosis
      // and tutor matching operate on known topic names.
      if (allowedTopics && allowedTopics.length) {
        const match = allowedTopics.find((t) => t.toLowerCase() === question.topic.toLowerCase());
        if (!match) return null;
        question.topic = match;
      }

      return question;
    })
    .filter(Boolean);

  if (normalized.length < Math.min(questionCount, 4)) {
    throw new Error(`Only ${normalized.length} valid questions survived validation`);
  }

  return normalized.slice(0, questionCount);
}

/**
 * Calls DeepSeek to generate questions.
 * @returns {Promise<Array>} normalized question objects
 * @throws when the key is absent, the request fails, or output is unusable
 */
async function requestQuestions({ moduleCode, materialName, topics, questionCount, pageCount }) {
  if (!env.deepseek.apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(env.deepseek.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.deepseek.apiKey}`,
      },
      body: JSON.stringify({
        model: env.deepseek.model,
        messages: [
          { role: 'system', content: 'You are a precise assessment author. You reply with valid JSON only.' },
          { role: 'user', content: buildPrompt({ moduleCode, materialName, topics, questionCount, pageCount }) },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`DeepSeek returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = extractJson(content);
    return normalizeQuestions(parsed, { allowedTopics: topics, questionCount });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates questions with a guaranteed result.
 *
 * @returns {Promise<{questions: Array, source: 'deepseek'|'fallback', fallback_reason?: string}>}
 */
async function generateQuestions(options) {
  try {
    const questions = await requestQuestions(options);
    return { questions, source: 'deepseek' };
  } catch (err) {
    console.warn('[deepseek] generation failed, using seeded question bank:', err.message);
    return {
      questions: QUIZ_QUESTIONS.slice(0, options.questionCount || QUIZ_QUESTIONS.length),
      source: 'fallback',
      fallback_reason: err.message,
    };
  }
}

module.exports = {
  generateQuestions,
  requestQuestions,
  normalizeQuestions,
  extractJson,
  buildPrompt,
};
