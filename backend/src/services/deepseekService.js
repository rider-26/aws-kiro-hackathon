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

// A grounded request ships up to ~30k characters of document text, so the model
// needs materially longer to read it than for a topic-list prompt.
const REQUEST_TIMEOUT_MS = 25000;
const GROUNDED_REQUEST_TIMEOUT_MS = 60000;
const VALID_ANSWERS = ['A', 'B', 'C', 'D'];

/**
 * Builds the generation prompt.
 *
 * Two modes, and the difference matters:
 *
 *  - GROUNDED (documentText supplied): the extracted document text is the source
 *    of truth, and the model derives its own topics from it. This is what makes
 *    "generated from your material" accurate.
 *  - TOPIC-ONLY (no text): we can only name topics and ask for general revision
 *    questions. Used for the bundled sample, and when a file's text cannot be
 *    read (a scanned PDF, for instance).
 *
 * The previous version was topic-only ALWAYS, and fell back to a hardcoded
 * cryptography topic list — so an uploaded economics deck produced questions
 * about password hashing. Passing the real text is the fix.
 */
function buildPrompt({ moduleCode, materialName, topics, questionCount, pageCount, documentText }) {
  const header = [
    'You are helping a Nanyang Polytechnic student revise.',
    moduleCode ? `Module: ${moduleCode}.` : '',
    `Study material: "${materialName}"${pageCount ? ` (${pageCount} pages)` : ''}.`,
  ].filter(Boolean);

  const commonRules = [
    '- Each question must have exactly four options and exactly one correct answer.',
    '- "correct_answer" must be one of "A", "B", "C", "D".',
    '- "explanation" must be one or two sentences explaining why the answer is correct.',
    `- "source_page" must be a plausible page number between 1 and ${pageCount || 30}.`,
    '- Do not repeat the same question twice.',
  ];

  const shape = [
    '',
    'Respond with ONLY a JSON object in exactly this shape, no markdown fences, no commentary:',
    '{"questions":[{"topic":"...","question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer":"B","explanation":"...","source_page":18}]}',
  ];

  if (documentText) {
    return [
      ...header,
      '',
      'The full text of their material is below, between the markers. Base EVERY',
      'question strictly on this content — do not introduce topics that do not',
      'appear in it.',
      '',
      '--- BEGIN MATERIAL ---',
      documentText,
      '--- END MATERIAL ---',
      '',
      `Write exactly ${questionCount} multiple-choice revision questions on this material.`,
      '',
      'Rules:',
      '- Identify the main topics actually covered by the material and spread the',
      '  questions across them as evenly as you can.',
      '- "topic" must be a short topic name (1-4 words) taken from the material itself,',
      '  for example a section heading or a key concept. Use the same wording',
      '  consistently for questions on the same topic.',
      '- Test understanding of what the material says, not general knowledge.',
      ...commonRules,
      ...shape,
    ].join('\n');
  }

  const topicList = topics && topics.length ? topics.join(', ') : 'the key concepts of the material';
  return [
    ...header,
    '',
    `Write exactly ${questionCount} multiple-choice revision questions covering these topics: ${topicList}.`,
    '',
    'Rules:',
    '- Distribute questions as evenly as possible across the listed topics.',
    '- "topic" must be one of the listed topics, copied verbatim.',
    ...commonRules,
    ...shape,
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

const MAX_TOPIC_WORDS = 6;
const MAX_TOPIC_CHARS = 60;

/**
 * Tidies a model-derived topic name into something usable as a grouping key.
 *
 * Topic strings become the axis of the whole diagnosis report and the input to
 * tutor matching, so inconsistent casing or a stray full sentence would fragment
 * a student's results into meaningless one-question "topics". Title-cases so
 * "price elasticity" and "Price Elasticity" collapse to one bucket.
 */
function canonicaliseTopic(raw) {
  const cleaned = String(raw || '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.:;,]+$/, '')
    .trim();

  if (!cleaned) return '';

  const words = cleaned.split(' ').slice(0, MAX_TOPIC_WORDS);
  const capped = words.join(' ').slice(0, MAX_TOPIC_CHARS).trim();

  // Preserve existing capitalisation for acronyms (HMAC, RSA, GDP), title-case
  // ordinary words.
  return capped
    .split(' ')
    .map((w) => (w === w.toUpperCase() && w.length <= 5 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
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

      if (allowedTopics && allowedTopics.length) {
        // Topic-only mode: we named the topics, so anything outside that set is
        // the model drifting and gets dropped. Keeps diagnosis and tutor
        // matching operating on topic names we already know.
        const match = allowedTopics.find((t) => t.toLowerCase() === question.topic.toLowerCase());
        if (!match) return null;
        question.topic = match;
      } else {
        // Grounded mode: topics come from the document, so there is no list to
        // check against — dropping them would discard every question. Normalise
        // instead, so "Price Elasticity" and "price elasticity" group together
        // in the diagnosis report rather than splitting into two topics.
        question.topic = canonicaliseTopic(question.topic);
        if (!question.topic) return null;
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
async function requestQuestions({ moduleCode, materialName, topics, questionCount, pageCount, documentText }) {
  if (!env.deepseek.apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    documentText ? GROUNDED_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS
  );

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
          {
            role: 'user',
            content: buildPrompt({ moduleCode, materialName, topics, questionCount, pageCount, documentText }),
          },
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
    // Only constrain topics when WE supplied them. In grounded mode the topics
    // legitimately come from the document, so there is nothing to constrain to.
    return normalizeQuestions(parsed, {
      allowedTopics: documentText ? null : topics,
      questionCount,
    });
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
    return {
      questions,
      source: 'deepseek',
      // Records whether the model actually saw the document, so the UI can tell
      // "generated from your material" apart from "general questions about the
      // topics we could name". Those are different claims.
      grounded: !!options.documentText,
    };
  } catch (err) {
    console.warn('[deepseek] generation failed, using seeded question bank:', err.message);
    return {
      questions: QUIZ_QUESTIONS.slice(0, options.questionCount || QUIZ_QUESTIONS.length),
      source: 'fallback',
      grounded: false,
      fallback_reason: err.message,
    };
  }
}

module.exports = {
  generateQuestions,
  requestQuestions,
  normalizeQuestions,
  canonicaliseTopic,
  extractJson,
  buildPrompt,
};
