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
const ALEX = tokenFor('user_alex', 'Tutor');

const QUIZ = {
  id: 'quiz_1', student_id: 'user_jinyu', study_material_id: 'material_1',
  module_id: 'module_it2513', title: 'IT2513 — Topic05', source: 'fallback',
};

// Four questions across two topics keeps expected scores easy to reason about.
const QUESTIONS = [
  { id: 'q1', quiz_id: 'quiz_1', order: 1, topic: 'Digital Signatures', question_text: 'Q1', answer_type: 'multiple_choice', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_answer: 'B', explanation: 'E1', source_page: 18 },
  { id: 'q2', quiz_id: 'quiz_1', order: 2, topic: 'Digital Signatures', question_text: 'Q2', answer_type: 'multiple_choice', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_answer: 'C', explanation: 'E2', source_page: 19 },
  { id: 'q3', quiz_id: 'quiz_1', order: 3, topic: 'Certificates', question_text: 'Q3', answer_type: 'multiple_choice', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_answer: 'A', explanation: 'E3', source_page: 25 },
  { id: 'q4', quiz_id: 'quiz_1', order: 4, topic: 'Certificates', question_text: 'Q4', answer_type: 'multiple_choice', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_answer: 'D', explanation: 'E4', source_page: 26 },
];

const ATTEMPT = {
  id: 'attempt_1', quiz_id: 'quiz_1', student_id: 'user_jinyu',
  module_id: 'module_it2513', total_questions: 4, status: 'In Progress',
};

function setupMocks({ quiz = QUIZ, attempt = ATTEMPT, existingResponses = [] } = {}) {
  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.quizzes) return { Item: quiz };
    if (input.TableName === env.tables.quizAttempts) return { Item: attempt };
    if (input.TableName === env.tables.quizQuestions) {
      return { Item: QUESTIONS.find((q) => q.id === input.Key.id) || null };
    }
    if (input.TableName === env.tables.studyMaterials) {
      return { Item: { id: 'material_1', student_id: 'user_jinyu', filename: 'Topic05_DigitalSignatures.pdf', module_id: 'module_it2513', is_sample: true, page_count: 28, topics: ['Digital Signatures', 'Certificates'] } };
    }
    if (input.TableName === env.tables.modules) {
      return { Item: { id: 'module_it2513', module_code: 'IT2513' } };
    }
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.quizQuestions) return { Items: QUESTIONS };
    if (input.TableName === env.tables.quizResponses) return { Items: existingResponses };
    if (input.TableName === env.tables.quizAttempts) return { Items: [attempt] };
    if (input.TableName === env.tables.quizzes) return { Items: [quiz] };
    if (input.TableName === env.tables.studyMaterials) return { Items: [] };
    return { Items: [] };
  });

  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(DeleteCommand).resolves({});
  ddbMock.on(UpdateCommand).callsFake((input) => {
    const values = input.ExpressionAttributeValues || {};
    const names = input.ExpressionAttributeNames || {};
    const patch = {};
    for (const [placeholder, value] of Object.entries(values)) {
      const key = placeholder.replace(':', '');
      patch[names[`#${key}`] || key] = value;
    }
    return { Attributes: { ...attempt, ...patch } };
  });
}

beforeEach(() => {
  ddbMock.reset();
  setupMocks();
});

describe('GET /api/quizzes/:id — privacy (business rule 9)', () => {
  it('returns the quiz to its owner without leaking the answer key', async () => {
    const res = await request(app).get('/api/quizzes/quiz_1')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(4);
    for (const q of res.body.data.questions) {
      expect(q.correct_answer).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    }
  });

  it('denies another student access to the quiz', async () => {
    const res = await request(app).get('/api/quizzes/quiz_1')
      .set('Authorization', `Bearer ${FARHAN}`);

    expect(res.status).toBe(403);
  });

  it('denies a tutor access to student quiz data', async () => {
    const res = await request(app).get('/api/quizzes/quiz_1')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/quizzes/quiz_1');
    expect(res.status).toBe(401);
  });

  it('returns questions in order', async () => {
    const res = await request(app).get('/api/quizzes/quiz_1')
      .set('Authorization', `Bearer ${JINYU}`);
    expect(res.body.data.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });
});

describe('POST /api/quizzes/:id/grade — per-question feedback', () => {
  it('marks a correct answer and returns the explanation and page to review', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/grade')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ question_id: 'q1', selected_answer: 'B', attempt_id: 'attempt_1' });

    expect(res.status).toBe(200);
    expect(res.body.data.correct).toBe(true);
    expect(res.body.data.correct_answer).toBe('B');
    expect(res.body.data.explanation).toBe('E1');
    expect(res.body.data.source_page).toBe(18);
    expect(res.body.data.topic).toBe('Digital Signatures');
  });

  it('marks an incorrect answer but still reveals the correct one', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/grade')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ question_id: 'q1', selected_answer: 'A', attempt_id: 'attempt_1' });

    expect(res.body.data.correct).toBe(false);
    expect(res.body.data.correct_answer).toBe('B');
  });

  it('accepts lower-case answer letters', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/grade')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ question_id: 'q1', selected_answer: 'b', attempt_id: 'attempt_1' });

    expect(res.body.data.correct).toBe(true);
  });

  it('404s for a question that is not on this quiz', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/grade')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ question_id: 'q_other', selected_answer: 'A' });

    expect(res.status).toBe(404);
  });

  it('denies grading on another student\'s quiz', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/grade')
      .set('Authorization', `Bearer ${FARHAN}`)
      .send({ question_id: 'q1', selected_answer: 'B' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/quizzes/:id/submit — server-side scoring', () => {
  it('scores a perfect submission as 4/4 = 100%', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ attempt_id: 'attempt_1', answers: { q1: 'B', q2: 'C', q3: 'A', q4: 'D' } });

    expect(res.status).toBe(200);
    expect(res.body.data.attempt.score).toBe(4);
    expect(res.body.data.attempt.total_questions).toBe(4);
    expect(res.body.data.attempt.percentage).toBe(100);
    expect(res.body.data.attempt.status).toBe('Completed');
  });

  it('scores a half-correct submission as 2/4 = 50%', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ attempt_id: 'attempt_1', answers: { q1: 'B', q2: 'A', q3: 'A', q4: 'B' } });

    expect(res.body.data.attempt.score).toBe(2);
    expect(res.body.data.attempt.percentage).toBe(50);
  });

  it('scores unanswered questions as incorrect rather than skipping them', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ attempt_id: 'attempt_1', answers: { q1: 'B' } });

    expect(res.body.data.attempt.score).toBe(1);
    expect(res.body.data.attempt.total_questions).toBe(4);
    expect(res.body.data.attempt.percentage).toBe(25);
    expect(res.body.data.responses).toHaveLength(4);
  });

  it('ignores client-claimed correctness and grades against the stored key', async () => {
    // The client sends wrong answers but also tries to smuggle a score; the
    // server must derive the score only from the answer key.
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ attempt_id: 'attempt_1', answers: { q1: 'A', q2: 'A', q3: 'B', q4: 'B' }, score: 4, percentage: 100 });

    expect(res.body.data.attempt.score).toBe(0);
    expect(res.body.data.attempt.percentage).toBe(0);
  });

  it('records a response row per question tagged with its topic', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ attempt_id: 'attempt_1', answers: { q1: 'B', q2: 'C', q3: 'B', q4: 'B' } });

    const topics = res.body.data.responses.map((r) => r.topic);
    expect(topics).toEqual(['Digital Signatures', 'Digital Signatures', 'Certificates', 'Certificates']);
    const correctFlags = res.body.data.responses.map((r) => r.correct);
    expect(correctFlags).toEqual([true, true, false, false]);
  });

  it('rejects a submission missing the answers object', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ attempt_id: 'attempt_1' });

    expect(res.status).toBe(400);
  });

  it('refuses to re-submit an already completed attempt', async () => {
    ddbMock.reset();
    setupMocks({ attempt: { ...ATTEMPT, status: 'Completed' } });

    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ attempt_id: 'attempt_1', answers: { q1: 'B' } });

    expect(res.status).toBe(409);
  });

  it('denies submitting to another student\'s quiz', async () => {
    const res = await request(app).post('/api/quizzes/quiz_1/submit')
      .set('Authorization', `Bearer ${FARHAN}`)
      .send({ answers: { q1: 'B' } });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/quizzes/attempts/:attemptId — review', () => {
  it('reveals the answer key for the owner\'s own completed attempt', async () => {
    ddbMock.reset();
    setupMocks({
      attempt: { ...ATTEMPT, status: 'Completed', score: 2, percentage: 50 },
      existingResponses: [
        { id: 'r1', attempt_id: 'attempt_1', question_id: 'q1', selected_answer: 'B', correct: true, topic: 'Digital Signatures' },
        { id: 'r2', attempt_id: 'attempt_1', question_id: 'q3', selected_answer: 'B', correct: false, topic: 'Certificates' },
      ],
    });

    const res = await request(app).get('/api/quizzes/attempts/attempt_1')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions[0].correct_answer).toBe('B');
    expect(res.body.data.questions[0].explanation).toBe('E1');
    expect(res.body.data.questions[0].response.correct).toBe(true);
  });

  it('denies another student access to the attempt', async () => {
    const res = await request(app).get('/api/quizzes/attempts/attempt_1')
      .set('Authorization', `Bearer ${FARHAN}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/quizzes/generate', () => {
  it('generates a quiz from the student\'s own material and reports the source', async () => {
    const res = await request(app).post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ study_material_id: 'material_1', question_count: 10 });

    expect(res.status).toBe(201);
    // No API key in the test environment, so this must transparently report fallback.
    expect(res.body.data.quiz.source).toBe('fallback');
    expect(res.body.data.questions).toHaveLength(10);
    expect(res.body.data.questions[0].correct_answer).toBeUndefined();
  });

  it('denies generating from another student\'s material', async () => {
    const res = await request(app).post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${FARHAN}`)
      .send({ study_material_id: 'material_1' });

    expect(res.status).toBe(403);
  });
});
