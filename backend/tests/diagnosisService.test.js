const {
  classify, computeTopicBreakdown, computeRecommendedPages, STATUS,
} = require('../src/services/diagnosisService');

describe('classify — spec section 17 thresholds', () => {
  it('treats 100 as Strong', () => expect(classify(100)).toBe(STATUS.STRONG));
  it('treats 80 as Strong (lower boundary)', () => expect(classify(80)).toBe(STATUS.STRONG));
  it('treats 79 as Developing (upper boundary)', () => expect(classify(79)).toBe(STATUS.DEVELOPING));
  it('treats 60 as Developing (lower boundary)', () => expect(classify(60)).toBe(STATUS.DEVELOPING));
  it('treats 59 as Needs Improvement (upper boundary)', () => expect(classify(59)).toBe(STATUS.NEEDS_IMPROVEMENT));
  it('treats 50 as Needs Improvement', () => expect(classify(50)).toBe(STATUS.NEEDS_IMPROVEMENT));
  it('treats 40 as Needs Improvement', () => expect(classify(40)).toBe(STATUS.NEEDS_IMPROVEMENT));
  it('treats 0 as Needs Improvement', () => expect(classify(0)).toBe(STATUS.NEEDS_IMPROVEMENT));
});

describe('computeTopicBreakdown', () => {
  it('computes per-topic percentages from responses', () => {
    const responses = [
      { topic: 'Hashing', correct: true },
      { topic: 'Hashing', correct: true },
      { topic: 'Digital Signatures', correct: true },
      { topic: 'Digital Signatures', correct: false },
      { topic: 'Certificates', correct: false },
      { topic: 'Certificates', correct: false },
    ];

    const breakdown = computeTopicBreakdown(responses);
    const byTopic = Object.fromEntries(breakdown.map((b) => [b.topic, b]));

    expect(byTopic.Hashing.score_percentage).toBe(100);
    expect(byTopic.Hashing.status).toBe(STATUS.STRONG);
    expect(byTopic['Digital Signatures'].score_percentage).toBe(50);
    expect(byTopic['Digital Signatures'].status).toBe(STATUS.NEEDS_IMPROVEMENT);
    expect(byTopic.Certificates.score_percentage).toBe(0);
    expect(byTopic.Certificates.status).toBe(STATUS.NEEDS_IMPROVEMENT);
  });

  it('sorts weakest topic first so gaps surface at the top', () => {
    const responses = [
      { topic: 'Strong Topic', correct: true },
      { topic: 'Weak Topic', correct: false },
      { topic: 'Mid Topic', correct: true },
      { topic: 'Mid Topic', correct: false },
    ];

    const breakdown = computeTopicBreakdown(responses);
    expect(breakdown.map((b) => b.topic)).toEqual(['Weak Topic', 'Mid Topic', 'Strong Topic']);
  });

  it('tracks correct and total counts per topic', () => {
    const responses = [
      { topic: 'RSA', correct: true },
      { topic: 'RSA', correct: false },
      { topic: 'RSA', correct: true },
    ];

    const [rsa] = computeTopicBreakdown(responses);
    expect(rsa.correct).toBe(2);
    expect(rsa.total).toBe(3);
    expect(rsa.score_percentage).toBe(67); // 2/3 rounded
    expect(rsa.status).toBe(STATUS.DEVELOPING);
  });

  it('buckets an untagged response under General rather than dropping it', () => {
    const breakdown = computeTopicBreakdown([{ correct: true }]);
    expect(breakdown[0].topic).toBe('General');
  });

  it('returns an empty array for no responses', () => {
    expect(computeTopicBreakdown([])).toEqual([]);
  });

  it('rounds percentages to whole numbers', () => {
    const responses = [
      { topic: 'X', correct: true },
      { topic: 'X', correct: false },
      { topic: 'X', correct: false },
      { topic: 'X', correct: false },
      { topic: 'X', correct: false },
      { topic: 'X', correct: false },
    ];
    // 1/6 = 16.67% -> 17
    expect(computeTopicBreakdown(responses)[0].score_percentage).toBe(17);
  });
});

describe('computeRecommendedPages', () => {
  const questions = [
    { id: 'q1', topic: 'Digital Signatures', source_page: 18 },
    { id: 'q2', topic: 'Digital Signatures', source_page: 19 },
    { id: 'q3', topic: 'Certificates', source_page: 25 },
    { id: 'q4', topic: 'Hashing', source_page: 6 },
  ];

  it('recommends only pages for questions answered incorrectly', () => {
    const responses = [
      { question_id: 'q1', topic: 'Digital Signatures', correct: false },
      { question_id: 'q2', topic: 'Digital Signatures', correct: false },
      { question_id: 'q3', topic: 'Certificates', correct: false },
      { question_id: 'q4', topic: 'Hashing', correct: true }, // correct -> excluded
    ];

    const pages = computeRecommendedPages(responses, questions);
    const byTopic = Object.fromEntries(pages.map((p) => [p.topic, p.pages]));

    expect(byTopic['Digital Signatures']).toEqual([18, 19]);
    expect(byTopic.Certificates).toEqual([25]);
    expect(byTopic.Hashing).toBeUndefined();
  });

  it('returns an empty list when everything was answered correctly', () => {
    const responses = questions.map((q) => ({ question_id: q.id, correct: true }));
    expect(computeRecommendedPages(responses, questions)).toEqual([]);
  });

  it('de-duplicates and sorts page numbers', () => {
    const dupQuestions = [
      { id: 'a', topic: 'RSA', source_page: 23 },
      { id: 'b', topic: 'RSA', source_page: 22 },
      { id: 'c', topic: 'RSA', source_page: 23 },
    ];
    const responses = dupQuestions.map((q) => ({ question_id: q.id, correct: false }));

    const [rsa] = computeRecommendedPages(responses, dupQuestions);
    expect(rsa.pages).toEqual([22, 23]);
  });

  it('ignores responses whose question is missing or has no page', () => {
    const responses = [
      { question_id: 'unknown', topic: 'X', correct: false },
      { question_id: 'nopage', topic: 'Y', correct: false },
    ];
    const qs = [{ id: 'nopage', topic: 'Y' }];
    expect(computeRecommendedPages(responses, qs)).toEqual([]);
  });
});

describe('demo scenario sanity (spec sections 31 & 32)', () => {
  it('a 7/10 attempt with weak signatures and certificates yields those as weak topics', () => {
    // 2 questions per topic; student misses one signature and both certificate questions.
    const responses = [
      { topic: 'Hashing', correct: true }, { topic: 'Hashing', correct: true },
      { topic: 'HMAC', correct: true }, { topic: 'HMAC', correct: true },
      { topic: 'RSA', correct: true }, { topic: 'RSA', correct: true },
      { topic: 'Digital Signatures', correct: true }, { topic: 'Digital Signatures', correct: false },
      { topic: 'Certificates', correct: false }, { topic: 'Certificates', correct: false },
    ];

    const breakdown = computeTopicBreakdown(responses);
    const weak = breakdown.filter((b) => b.status === STATUS.NEEDS_IMPROVEMENT).map((b) => b.topic);

    expect(responses.filter((r) => r.correct)).toHaveLength(7); // 7/10 overall
    expect(weak).toContain('Digital Signatures');
    expect(weak).toContain('Certificates');
    expect(weak).not.toContain('Hashing');
  });

  it('a 9/10 retake moves signatures and certificates out of Needs Improvement', () => {
    const responses = [
      { topic: 'Hashing', correct: true }, { topic: 'Hashing', correct: true },
      { topic: 'HMAC', correct: true }, { topic: 'HMAC', correct: true },
      { topic: 'RSA', correct: true }, { topic: 'RSA', correct: false },
      { topic: 'Digital Signatures', correct: true }, { topic: 'Digital Signatures', correct: true },
      { topic: 'Certificates', correct: true }, { topic: 'Certificates', correct: true },
    ];

    const breakdown = computeTopicBreakdown(responses);
    const byTopic = Object.fromEntries(breakdown.map((b) => [b.topic, b]));

    expect(responses.filter((r) => r.correct)).toHaveLength(9);
    expect(byTopic['Digital Signatures'].status).toBe(STATUS.STRONG);
    expect(byTopic.Certificates.status).toBe(STATUS.STRONG);
  });
});
