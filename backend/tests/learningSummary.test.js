const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const learningSummaryService = require('../src/services/learningSummaryService');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(id, role) {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const ALEX = tokenFor('user_alex', 'Tutor');       // has a booking with Jinyu
const MARCUS = tokenFor('user_marcus', 'Tutor');   // has NO booking with Jinyu
const JINYU = tokenFor('user_jinyu', 'Tutee');
const ADMIN = tokenFor('user_lim', 'Admin');

const IT2513 = { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' };

const ATTEMPTS = [
  { id: 'attempt_1', quiz_id: 'quiz_1', student_id: 'user_jinyu', module_id: 'module_it2513', score: 7, total_questions: 10, percentage: 70, status: 'Completed', completed_date: '2026-08-11T10:00:00.000Z' },
  { id: 'attempt_2', quiz_id: 'quiz_1', student_id: 'user_jinyu', module_id: 'module_it2513', score: 9, total_questions: 10, percentage: 90, status: 'Completed', completed_date: '2026-08-18T10:00:00.000Z' },
];

const TOPIC_PERF = [
  { id: 'tp1', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Certificates', score_percentage: 40, status: 'Needs Improvement' },
  { id: 'tp2', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Digital Signatures', score_percentage: 50, status: 'Needs Improvement' },
  { id: 'tp3', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'RSA', score_percentage: 70, status: 'Developing' },
  { id: 'tp4', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Hashing', score_percentage: 100, status: 'Strong' },
];

function setupMocks({
  shareEnabled = true,
  bookings = [{ id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', status: 'Accepted' }],
  savedTutors = [],
} = {}) {
  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.users) {
      if (input.Key.id === 'user_jinyu') {
        return { Item: {
          id: 'user_jinyu', full_name: 'Jinyu Chen', course: 'IT', year_of_study: '2',
          role: 'Tutee', share_learning_summary: shareEnabled, password_hash: 'secret',
        } };
      }
      return { Item: { id: input.Key.id, full_name: 'Alex Tan', role: 'Tutor', password_hash: 'secret' } };
    }
    if (input.TableName === env.tables.modules) return { Item: IT2513 };
    if (input.TableName === env.tables.quizzes) {
      return { Item: { id: 'quiz_1', title: 'IT2513 — Topic05', module_id: 'module_it2513' } };
    }
    if (input.TableName === env.tables.tutorProfiles) {
      return { Item: { id: input.Key.id, user_id: input.Key.id === 'tutorprofile_alex' ? 'user_alex' : 'user_marcus' } };
    }
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.tutorProfiles && input.IndexName === 'userId-index') {
      const uid = input.ExpressionAttributeValues[':uid'];
      if (uid === 'user_alex') return { Items: [{ id: 'tutorprofile_alex', user_id: 'user_alex' }] };
      if (uid === 'user_marcus') return { Items: [{ id: 'tutorprofile_marcus', user_id: 'user_marcus' }] };
      return { Items: [] };
    }
    if (input.TableName === env.tables.bookings) {
      const tid = input.ExpressionAttributeValues[':tid'];
      const sid = input.ExpressionAttributeValues[':sid'];
      if (tid) return { Items: bookings.filter((b) => b.tutor_id === tid) };
      if (sid) return { Items: bookings.filter((b) => b.student_id === sid) };
      return { Items: bookings };
    }
    if (input.TableName === env.tables.quizAttempts) return { Items: ATTEMPTS };
    if (input.TableName === env.tables.topicPerformance) return { Items: TOPIC_PERF };
    if (input.TableName === env.tables.savedTutors) return { Items: savedTutors };
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
    return { Attributes: { id: input.Key.id, ...patch } };
  });
}

beforeEach(() => {
  ddbMock.reset();
  setupMocks();
});

describe('GET /api/users/:studentId/learning-summary — both conditions required', () => {
  it('shares the summary when the flag is on AND a booking exists', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
    expect(res.body.data.student.full_name).toBe('Jinyu Chen');
    expect(res.body.data.latest_quiz.score).toBe(9);
    expect(res.body.data.latest_quiz.percentage).toBe(90);
    expect(res.body.data.improvement_delta).toBe(20);
    expect(res.body.data.shared_by_student).toBe(true);
  });

  it('condition 1: refuses when the student has sharing switched OFF', async () => {
    ddbMock.reset();
    setupMocks({ shareEnabled: false });

    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not shared/i);
  });

  it('condition 2: refuses a tutor with no booking with this student', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${MARCUS}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/booking/i);
  });

  it('refuses when the only booking was declined', async () => {
    ddbMock.reset();
    setupMocks({
      bookings: [{ id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', status: 'Declined' }],
    });

    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(403);
  });

  it('refuses when the only booking was cancelled', async () => {
    ddbMock.reset();
    setupMocks({
      bookings: [{ id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', status: 'Cancelled' }],
    });

    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(403);
  });

  it('allows access for a Pending booking', async () => {
    ddbMock.reset();
    setupMocks({
      bookings: [{ id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', status: 'Pending' }],
    });

    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
  });

  it('allows access for a Completed booking', async () => {
    ddbMock.reset();
    setupMocks({
      bookings: [{ id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', status: 'Completed' }],
    });

    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
  });

  it('is not accessible to a student', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${JINYU}`);
    expect(res.status).toBe(403);
  });

  it('is not accessible to an admin through this route', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary');
    expect(res.status).toBe(401);
  });
});

describe('shared summary payload — deliberately narrow', () => {
  it('includes weak, developing and strong topics with module codes', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    const { weak_topics, developing_topics, strong_topics } = res.body.data;
    expect(weak_topics.map((t) => t.topic)).toEqual(['Certificates', 'Digital Signatures']);
    expect(developing_topics.map((t) => t.topic)).toEqual(['RSA']);
    expect(strong_topics.map((t) => t.topic)).toEqual(['Hashing']);
    expect(weak_topics[0].module_code).toBe('IT2513');
  });

  it('includes a suggested session focus naming the weak topics', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.body.data.suggested_focus).toMatch(/Certificates/);
    expect(res.body.data.suggested_focus).toMatch(/Digital Signatures/);
  });

  it('does not expose raw quiz responses, attempt lists or study material', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    const body = res.body.data;
    expect(body.history).toBeUndefined();
    expect(body.responses).toBeUndefined();
    expect(body.attempts).toBeUndefined();
    expect(body.study_materials).toBeUndefined();
    expect(body.quizzes).toBeUndefined();
  });

  it('does not expose the student\'s email or password hash', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.body.data.student.password_hash).toBeUndefined();
    expect(res.body.data.student.email).toBeUndefined();
  });

  it('carries a notice that the student can withdraw access', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary')
      .set('Authorization', `Bearer ${ALEX}`);
    expect(res.body.data.notice).toMatch(/withdraw/i);
  });
});

describe('GET /api/users/:studentId/learning-summary/access', () => {
  it('reports allowed without throwing when both conditions hold', async () => {
    const res = await request(app).get('/api/users/user_jinyu/learning-summary/access')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
    expect(res.body.data.allowed).toBe(true);
  });

  it('reports the reason without throwing when sharing is off', async () => {
    ddbMock.reset();
    setupMocks({ shareEnabled: false });

    const res = await request(app).get('/api/users/user_jinyu/learning-summary/access')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
    expect(res.body.data.allowed).toBe(false);
    expect(res.body.data.reason).toMatch(/not shared/i);
  });
});

describe('PATCH /api/users/me — the sharing toggle', () => {
  it('turns sharing on', async () => {
    const res = await request(app).patch('/api/users/me')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ share_learning_summary: true });

    expect(res.status).toBe(200);
    expect(res.body.data.user.share_learning_summary).toBe(true);
  });

  it('turns sharing off', async () => {
    const res = await request(app).patch('/api/users/me')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ share_learning_summary: false });

    expect(res.body.data.user.share_learning_summary).toBe(false);
  });

  it('coerces a truthy non-boolean to a real boolean', async () => {
    const res = await request(app).patch('/api/users/me')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ share_learning_summary: 'yes' });

    expect(res.body.data.user.share_learning_summary).toBe(true);
  });

  it('ignores fields that are not user-editable', async () => {
    const res = await request(app).patch('/api/users/me')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ role: 'Admin', account_status: 'Suspended', full_name: 'New Name' });

    expect(res.body.data.user.role).toBeUndefined(); // never written
    expect(res.body.data.user.account_status).toBeUndefined();
    expect(res.body.data.user.full_name).toBe('New Name');
  });
});

describe('GET /api/users/me/sharing', () => {
  it('tells the student who would gain access', async () => {
    const res = await request(app).get('/api/users/me/sharing')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.share_learning_summary).toBe(true);
    expect(res.body.data.shared_with).toHaveLength(1);
    expect(res.body.data.shared_with[0].full_name).toBe('Alex Tan');
  });

  it('is not accessible to a tutor', async () => {
    const res = await request(app).get('/api/users/me/sharing')
      .set('Authorization', `Bearer ${ALEX}`);
    expect(res.status).toBe(403);
  });
});

describe('buildSuggestedFocus', () => {
  it('prioritises weak topics', () => {
    const focus = learningSummaryService.buildSuggestedFocus(
      [{ topic: 'Certificates' }, { topic: 'Digital Signatures' }],
      [{ topic: 'RSA' }]
    );
    expect(focus).toMatch(/Certificates, Digital Signatures/);
    expect(focus).toMatch(/below 60/);
  });

  it('falls back to developing topics when there are no weak ones', () => {
    const focus = learningSummaryService.buildSuggestedFocus([], [{ topic: 'RSA' }]);
    expect(focus).toMatch(/Consolidate RSA/);
  });

  it('handles a student with no gaps at all', () => {
    const focus = learningSummaryService.buildSuggestedFocus([], []);
    expect(focus).toMatch(/No weak topics/i);
  });
});

describe('saved tutors', () => {
  it('saves a tutor', async () => {
    const res = await request(app).post('/api/users/me/saved-tutors/tutorprofile_alex')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(201);
    expect(res.body.data.saved.tutor_id).toBe('tutorprofile_alex');
    expect(res.body.data.saved.student_id).toBe('user_jinyu');
  });

  it('is idempotent when saving the same tutor twice', async () => {
    ddbMock.reset();
    setupMocks({
      savedTutors: [{ id: 'saved_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex' }],
    });

    const res = await request(app).post('/api/users/me/saved-tutors/tutorprofile_alex')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(201);
    expect(res.body.data.saved.id).toBe('saved_1'); // existing row returned
  });

  it('unsaves a tutor', async () => {
    ddbMock.reset();
    setupMocks({
      savedTutors: [{ id: 'saved_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex' }],
    });

    const res = await request(app).delete('/api/users/me/saved-tutors/tutorprofile_alex')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
  });

  it('reports removed:false when the tutor was not saved', async () => {
    const res = await request(app).delete('/api/users/me/saved-tutors/tutorprofile_alex')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.body.data.removed).toBe(false);
  });

  it('returns saved tutor ids for marking search results', async () => {
    ddbMock.reset();
    setupMocks({
      savedTutors: [
        { id: 'saved_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex' },
        { id: 'saved_2', student_id: 'user_jinyu', tutor_id: 'tutorprofile_marcus' },
      ],
    });

    const res = await request(app).get('/api/users/me/saved-tutors/ids')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.body.data.tutor_ids).toEqual(['tutorprofile_alex', 'tutorprofile_marcus']);
  });

  it('is not accessible to a tutor', async () => {
    const res = await request(app).get('/api/users/me/saved-tutors')
      .set('Authorization', `Bearer ${ALEX}`);
    expect(res.status).toBe(403);
  });
});
