const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(id, role = 'Tutee') {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const JINYU = tokenFor('user_jinyu');
const FARHAN = tokenFor('user_farhan');

const QUIZ = {
  id: 'quiz_1', student_id: 'user_jinyu', module_id: 'module_it2513',
  title: 'IT2513 — Topic05', source: 'fallback',
};

// Ten questions, two per topic — mirrors the seeded IT2513 bank.
const TOPICS = ['Hashing', 'HMAC', 'RSA', 'Digital Signatures', 'Certificates'];
const QUESTIONS = TOPICS.flatMap((topic, t) => [0, 1].map((i) => ({
  id: `q${t}_${i}`,
  quiz_id: 'quiz_1',
  order: t * 2 + i + 1,
  topic,
  question_text: `${topic} question ${i + 1}`,
  answer_type: 'multiple_choice',
  option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd',
  correct_answer: 'A',
  explanation: `Explanation for ${topic} ${i + 1}`,
  source_page: 10 + t * 4 + i,
})));

const ATTEMPT = {
  id: 'attempt_1', quiz_id: 'quiz_1', student_id: 'user_jinyu',
  module_id: 'module_it2513', total_questions: 10, status: 'In Progress',
};

let capturedTopicPerformancePuts = [];

function setupMocks({ attempt = ATTEMPT, existingTopicPerf = [], existingResponses = [] } = {}) {
  capturedTopicPerformancePuts = [];

  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.quizzes) return { Item: QUIZ };
    if (input.TableName === env.tables.quizAttempts) return { Item: attempt };
    if (input.TableName === env.tables.quizQuestions) {
      return { Item: QUESTIONS.find((q) => q.id === input.Key.id) || null };
    }
    if (input.TableName === env.tables.modules) {
      return { Item: { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' } };
    }
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.quizQuestions) return { Items: QUESTIONS };
    if (input.TableName === env.tables.quizResponses) return { Items: existingResponses };
    if (input.TableName === env.tables.topicPerformance) return { Items: existingTopicPerf };
    if (input.TableName === env.tables.quizAttempts) return { Items: [attempt] };
    return { Items: [] };
  });

  ddbMock.on(PutCommand).callsFake((input) => {
    if (input.TableName === env.tables.topicPerformance) {
      capturedTopicPerformancePuts.push(input.Item);
    }
    return {};
  });

  ddbMock.on(DeleteCommand).resolves({});

  ddbMock.on(UpdateCommand).callsFake((input) => {
    const values = input.ExpressionAttributeValues || {};
    const names = input.ExpressionAttributeNames || {};
    const patch = {};
    for (const [placeholder, value] of Object.entries(values)) {
      const key = placeholder.replace(':', '');
      patch[names[`#${key}`] || key] = value;
    }
    return { Attributes: { ...attempt, ...patch, id: input.Key.id } };
  });
}

/** Builds an answers map: correct 'A' for listed topics, wrong 'B' otherwise. */
function answersWith({ correctTopics = [], partialTopics = {} }) {
  const answers = {};
  for (const q of QUESTIONS) {
    if (correctTopics.includes(q.topic)) {
      answers[q.id] = 'A';
    } else if (partialTopics[q.topic] !== undefined) {
      // Answer only the first question of that topic correctly.
      answers[q.id] = q.id.endsWith('_0') && partialTopics[q.topic] > 0 ? 'A' : 'B';
    } else {
      answers[q.id] = 'B';
    }
  }
  return answers;
}

beforeEach(() => {
  ddbMock.reset();
  setupMocks();
});

describe('POST /api/quizzes/:id/submit — diagnosis attached to submission', () => {
  it('returns a diagnosis with per-topic breakdown and classification', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({
        attempt_id: 'attempt_1',
        answers: answersWith({
          correctTopics: ['Hashing', 'HMAC', 'RSA'],
          partialTopics: { 'Digital Signatures': 1 },
        }),
      });

    expect(res.status).toBe(200);
    const { diagnosis } = res.body.data;

    expect(diagnosis.score).toBe(7);
    expect(diagnosis.total_questions).toBe(10);
    expect(diagnosis.percentage).toBe(70);

    const byTopic = Object.fromEntries(diagnosis.breakdown.map((b) => [b.topic, b]));
    expect(byTopic.Hashing.score_percentage).toBe(100);
    expect(byTopic.Hashing.status).toBe('Strong');
    expect(byTopic['Digital Signatures'].score_percentage).toBe(50);
    expect(byTopic['Digital Signatures'].status).toBe('Needs Improvement');
    expect(byTopic.Certificates.score_percentage).toBe(0);
    expect(byTopic.Certificates.status).toBe('Needs Improvement');
  });

  it('lists weak topics in the order tutor matching should prioritise them', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({
        attempt_id: 'attempt_1',
        answers: answersWith({
          correctTopics: ['Hashing', 'HMAC', 'RSA'],
          partialTopics: { 'Digital Signatures': 1 },
        }),
      });

    const { weak_topics } = res.body.data.diagnosis;
    // Certificates (0%) is weaker than Digital Signatures (50%), so it comes first.
    expect(weak_topics).toEqual(['Certificates', 'Digital Signatures']);
  });

  it('groups strong, developing and needs-improvement topics separately', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({
        attempt_id: 'attempt_1',
        answers: answersWith({ correctTopics: ['Hashing', 'HMAC'] }),
      });

    const { strong, developing, needs_improvement } = res.body.data.diagnosis;
    expect(strong.map((s) => s.topic).sort()).toEqual(['HMAC', 'Hashing']);
    expect(developing).toHaveLength(0); // no topic lands in 60-79 with 2 questions each
    expect(needs_improvement.map((n) => n.topic).sort()).toEqual(['Certificates', 'Digital Signatures', 'RSA']);
  });

  it('recommends pages only for the questions answered incorrectly', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({
        attempt_id: 'attempt_1',
        answers: answersWith({ correctTopics: ['Hashing', 'HMAC', 'RSA', 'Digital Signatures'] }),
      });

    const { recommended_pages } = res.body.data.diagnosis;
    expect(recommended_pages).toHaveLength(1);
    expect(recommended_pages[0].topic).toBe('Certificates');
    // Certificates is topic index 4 -> pages 10 + 16 + i => 26, 27
    expect(recommended_pages[0].pages).toEqual([26, 27]);
  });

  it('persists a TopicPerformance row per topic', async () => {
    await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ attempt_id: 'attempt_1', answers: answersWith({ correctTopics: ['Hashing'] }) });

    expect(capturedTopicPerformancePuts).toHaveLength(5);
    const topics = capturedTopicPerformancePuts.map((p) => p.topic).sort();
    expect(topics).toEqual(['Certificates', 'Digital Signatures', 'HMAC', 'Hashing', 'RSA']);

    const hashing = capturedTopicPerformancePuts.find((p) => p.topic === 'Hashing');
    expect(hashing.student_id).toBe('user_jinyu');
    expect(hashing.module_id).toBe('module_it2513');
    expect(hashing.score_percentage).toBe(100);
    expect(hashing.status).toBe('Strong');
    expect(hashing.updated_date).toBeTruthy();
  });

  it('updates an existing TopicPerformance row instead of inserting a duplicate', async () => {
    ddbMock.reset();
    setupMocks({
      existingTopicPerf: [
        { id: 'tp_existing', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Hashing', score_percentage: 0, status: 'Needs Improvement' },
      ],
    });

    await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ attempt_id: 'attempt_1', answers: answersWith({ correctTopics: ['Hashing'] }) });

    // Hashing already existed, so only the other four topics are inserted.
    const insertedTopics = capturedTopicPerformancePuts.map((p) => p.topic);
    expect(insertedTopics).not.toContain('Hashing');
    expect(insertedTopics).toHaveLength(4);
  });
});

describe('GET /api/quizzes/attempts/:attemptId/diagnosis', () => {
  const completedAttempt = {
    ...ATTEMPT, status: 'Completed', score: 7, percentage: 70,
  };

  const responses = [
    ...TOPICS.slice(0, 3).flatMap((topic, t) => [0, 1].map((i) => ({
      id: `r${t}_${i}`, attempt_id: 'attempt_1', question_id: `q${t}_${i}`, correct: true, topic,
    }))),
    { id: 'r3_0', attempt_id: 'attempt_1', question_id: 'q3_0', correct: true, topic: 'Digital Signatures' },
    { id: 'r3_1', attempt_id: 'attempt_1', question_id: 'q3_1', correct: false, topic: 'Digital Signatures' },
    { id: 'r4_0', attempt_id: 'attempt_1', question_id: 'q4_0', correct: false, topic: 'Certificates' },
    { id: 'r4_1', attempt_id: 'attempt_1', question_id: 'q4_1', correct: false, topic: 'Certificates' },
  ];

  it('recomputes the diagnosis for a completed attempt so the page can be revisited', async () => {
    ddbMock.reset();
    setupMocks({ attempt: completedAttempt, existingResponses: responses });

    const res = await request(app).get('/api/quizzes/attempts/attempt_1/diagnosis')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.diagnosis.weak_topics).toEqual(['Certificates', 'Digital Signatures']);
    expect(res.body.data.diagnosis.module_id).toBe('module_it2513');
    expect(res.body.data.diagnosis.percentage).toBe(70);
  });

  it('denies another student access to the diagnosis', async () => {
    ddbMock.reset();
    setupMocks({ attempt: completedAttempt, existingResponses: responses });

    const res = await request(app).get('/api/quizzes/attempts/attempt_1/diagnosis')
      .set('Authorization', `Bearer ${FARHAN}`);

    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/quizzes/attempts/attempt_1/diagnosis');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/progress', () => {
  it('returns topic performance grouped by status for the authenticated student', async () => {
    ddbMock.reset();
    setupMocks({
      existingTopicPerf: [
        { id: 'tp1', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Certificates', score_percentage: 40, status: 'Needs Improvement' },
        { id: 'tp2', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Digital Signatures', score_percentage: 50, status: 'Needs Improvement' },
        { id: 'tp3', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Hashing', score_percentage: 100, status: 'Strong' },
        { id: 'tp4', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'RSA', score_percentage: 70, status: 'Developing' },
      ],
    });

    const res = await request(app).get('/api/progress')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.weak_topics.map((t) => t.topic)).toEqual(['Certificates', 'Digital Signatures']);
    expect(res.body.data.developing_topics.map((t) => t.topic)).toEqual(['RSA']);
    expect(res.body.data.strong_topics.map((t) => t.topic)).toEqual(['Hashing']);
  });

  it('is not accessible to a tutor', async () => {
    const res = await request(app).get('/api/progress')
      .set('Authorization', `Bearer ${tokenFor('user_alex', 'Tutor')}`);
    expect(res.status).toBe(403);
  });
});
