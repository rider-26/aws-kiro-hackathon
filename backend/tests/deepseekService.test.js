const deepseekService = require('../src/services/deepseekService');
const { QUIZ_QUESTIONS } = require('../src/content/topic05Content');

const TOPICS = ['Hashing', 'HMAC', 'RSA', 'Digital Signatures', 'Certificates'];

function validQuestion(overrides = {}) {
  return {
    topic: 'Hashing',
    question_text: 'What is a hash?',
    option_a: 'A',
    option_b: 'B',
    option_c: 'C',
    option_d: 'D',
    correct_answer: 'b',
    explanation: 'Because.',
    source_page: '7',
    ...overrides,
  };
}

describe('extractJson', () => {
  it('parses a clean JSON object', () => {
    expect(deepseekService.extractJson('{"questions":[]}')).toEqual({ questions: [] });
  });

  it('tolerates markdown fences the model may add', () => {
    const wrapped = '```json\n{"questions":[]}\n```';
    expect(deepseekService.extractJson(wrapped)).toEqual({ questions: [] });
  });

  it('tolerates surrounding prose', () => {
    const noisy = 'Here you go!\n{"questions":[]}\nHope that helps.';
    expect(deepseekService.extractJson(noisy)).toEqual({ questions: [] });
  });

  it('throws on content with no JSON object', () => {
    expect(() => deepseekService.extractJson('no json here')).toThrow();
  });

  it('throws on empty input', () => {
    expect(() => deepseekService.extractJson('')).toThrow();
  });
});

describe('normalizeQuestions', () => {
  it('normalizes casing and numeric strings', () => {
    const result = deepseekService.normalizeQuestions(
      { questions: Array.from({ length: 4 }, () => validQuestion()) },
      { allowedTopics: TOPICS, questionCount: 4 }
    );
    expect(result).toHaveLength(4);
    expect(result[0].correct_answer).toBe('B'); // upper-cased
    expect(result[0].source_page).toBe(7); // parsed to a number
    expect(result[0].answer_type).toBe('multiple_choice');
  });

  it('drops questions with an invalid correct_answer', () => {
    const questions = [
      ...Array.from({ length: 4 }, () => validQuestion()),
      validQuestion({ correct_answer: 'E' }),
    ];
    const result = deepseekService.normalizeQuestions(
      { questions },
      { allowedTopics: TOPICS, questionCount: 10 }
    );
    expect(result).toHaveLength(4);
  });

  it('drops questions missing an option', () => {
    const questions = [
      ...Array.from({ length: 4 }, () => validQuestion()),
      validQuestion({ option_c: '' }),
    ];
    const result = deepseekService.normalizeQuestions(
      { questions },
      { allowedTopics: TOPICS, questionCount: 10 }
    );
    expect(result).toHaveLength(4);
  });

  it('drops questions whose topic is outside the requested set', () => {
    const questions = [
      ...Array.from({ length: 4 }, () => validQuestion()),
      validQuestion({ topic: 'Quantum Teleportation' }),
    ];
    const result = deepseekService.normalizeQuestions(
      { questions },
      { allowedTopics: TOPICS, questionCount: 10 }
    );
    expect(result).toHaveLength(4);
    expect(result.every((q) => TOPICS.includes(q.topic))).toBe(true);
  });

  it('canonicalises topic casing to the requested spelling', () => {
    const result = deepseekService.normalizeQuestions(
      { questions: Array.from({ length: 4 }, () => validQuestion({ topic: 'digital signatures' })) },
      { allowedTopics: TOPICS, questionCount: 4 }
    );
    expect(result[0].topic).toBe('Digital Signatures');
  });

  it('caps the result at the requested question count', () => {
    const result = deepseekService.normalizeQuestions(
      { questions: Array.from({ length: 12 }, () => validQuestion()) },
      { allowedTopics: TOPICS, questionCount: 10 }
    );
    expect(result).toHaveLength(10);
  });

  it('throws when too few questions survive validation', () => {
    expect(() => deepseekService.normalizeQuestions(
      { questions: [validQuestion(), validQuestion({ correct_answer: 'Z' })] },
      { allowedTopics: TOPICS, questionCount: 10 }
    )).toThrow(/survived validation/);
  });

  it('throws when the payload has no questions array', () => {
    expect(() => deepseekService.normalizeQuestions({}, { questionCount: 10 })).toThrow();
  });
});

describe('generateQuestions — fallback behaviour', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.DEEPSEEK_API_KEY = originalKey;
    jest.resetModules();
  });

  it('falls back to the seeded bank when no API key is configured', async () => {
    // config/env caches at require time; the service checks env.deepseek.apiKey,
    // which is undefined in the test environment (no .env present).
    const result = await deepseekService.generateQuestions({
      moduleCode: 'IT2513',
      materialName: 'Topic05_DigitalSignatures.pdf',
      topics: TOPICS,
      questionCount: 10,
      pageCount: 28,
    });

    expect(result.source).toBe('fallback');
    expect(result.questions).toHaveLength(10);
    expect(result.fallback_reason).toBeTruthy();
    // Confirms it really is the curated bank, including the spec's example question.
    expect(result.questions[0].question_text).toBe(QUIZ_QUESTIONS[0].question_text);
  });

  it('falls back when the HTTP request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const result = await deepseekService.generateQuestions({
      moduleCode: 'IT2513',
      materialName: 'sample.pdf',
      topics: TOPICS,
      questionCount: 10,
    });

    expect(result.source).toBe('fallback');
    expect(result.questions.length).toBe(10);
  });

  it('respects the requested count when falling back', async () => {
    const result = await deepseekService.generateQuestions({
      moduleCode: 'IT2513',
      materialName: 'sample.pdf',
      topics: TOPICS,
      questionCount: 5,
    });

    expect(result.questions).toHaveLength(5);
  });
});

describe('seeded question bank integrity (spec section 16)', () => {
  it('has ten questions', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(10);
  });

  it('covers all five required topics', () => {
    const topics = new Set(QUIZ_QUESTIONS.map((q) => q.topic));
    expect([...topics].sort()).toEqual([...TOPICS].sort());
  });

  it('gives every question four options, a valid answer, an explanation and a source page', () => {
    for (const q of QUIZ_QUESTIONS) {
      expect(q.option_a && q.option_b && q.option_c && q.option_d).toBeTruthy();
      expect(['A', 'B', 'C', 'D']).toContain(q.correct_answer);
      expect(q.explanation.length).toBeGreaterThan(10);
      expect(Number.isInteger(q.source_page)).toBe(true);
    }
  });

  it('matches the exact example question from the specification', () => {
    const example = QUIZ_QUESTIONS.find((q) => q.question_text === 'What is the primary purpose of a digital signature?');
    expect(example).toBeDefined();
    expect(example.option_b).toBe('Authentication and integrity');
    expect(example.correct_answer).toBe('B');
    expect(example.source_page).toBe(18);
  });
});
