const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(id, role) {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const JINYU = tokenFor('user_jinyu', 'Tutee');
const ALEX = tokenFor('user_alex', 'Tutor');
const ADMIN = tokenFor('user_lim', 'Admin');

const IT2513 = { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' };
const ALEX_PROFILE = {
  id: 'tutorprofile_alex', user_id: 'user_alex', average_rating: 4.8,
  students_helped: 41, completed_sessions: 24, total_tutoring_minutes: 1440,
  maximum_group_size: 5, physical_enabled: true, online_enabled: true,
};

// Spec's before/after attempts: 7/10 then 9/10.
const ATTEMPTS = [
  { id: 'attempt_1', quiz_id: 'quiz_1', student_id: 'user_jinyu', module_id: 'module_it2513', score: 7, total_questions: 10, percentage: 70, status: 'Completed', completed_date: '2026-08-11T10:00:00.000Z' },
  { id: 'attempt_2', quiz_id: 'quiz_1', student_id: 'user_jinyu', module_id: 'module_it2513', score: 9, total_questions: 10, percentage: 90, status: 'Completed', completed_date: '2026-08-18T10:00:00.000Z' },
];

// Spec's exact "before" topic figures.
const TOPIC_PERF = [
  { id: 'tp1', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Certificates', score_percentage: 40, status: 'Needs Improvement' },
  { id: 'tp2', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Digital Signatures', score_percentage: 50, status: 'Needs Improvement' },
  { id: 'tp3', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Hashing', score_percentage: 100, status: 'Strong' },
];

function setupMocks({ attempts = ATTEMPTS, topicPerf = TOPIC_PERF, participations = [] } = {}) {
  ddbMock.on(ScanCommand).callsFake((input) => {
    if (input.TableName === env.tables.tutorProfiles) return { Items: [ALEX_PROFILE] };
    return { Items: [] };
  });

  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.users) {
      const names = { user_jinyu: 'Jinyu Chen', user_alex: 'Alex Tan' };
      return { Item: { id: input.Key.id, full_name: names[input.Key.id] || 'User', course: 'IT', year_of_study: '2', password_hash: 'secret' } };
    }
    if (input.TableName === env.tables.modules) return { Item: IT2513 };
    if (input.TableName === env.tables.tutorProfiles) return { Item: ALEX_PROFILE };
    if (input.TableName === env.tables.quizzes) {
      return { Item: { id: 'quiz_1', title: 'IT2513 — Topic05', module_id: 'module_it2513' } };
    }
    if (input.TableName === env.tables.sessions) return { Item: null };
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.quizAttempts) return { Items: attempts };
    if (input.TableName === env.tables.topicPerformance) return { Items: topicPerf };
    if (input.TableName === env.tables.sessionParticipants) return { Items: participations };
    if (input.TableName === env.tables.bookings) return { Items: [] };
    if (input.TableName === env.tables.reviews) return { Items: [] };
    if (input.TableName === env.tables.tutorProfiles && input.IndexName === 'userId-index') {
      const uid = input.ExpressionAttributeValues[':uid'];
      return { Items: uid === 'user_alex' ? [ALEX_PROFILE] : [] };
    }
    if (input.TableName === env.tables.tutorVerifications) {
      return { Items: [{ id: 'v1', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', status: 'Verified' }] };
    }
    if (input.TableName === env.tables.tutorTopics) {
      return { Items: [
        { id: 't1', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', topic_name: 'Digital Signatures' },
        { id: 't2', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', topic_name: 'Certificates' },
      ] };
    }
    if (input.TableName === env.tables.tutorAvailability) {
      return { Items: [{ id: 'a1', tutor_id: 'tutorprofile_alex', day_or_date: 'Wednesday', start_time: '13:00', end_time: '16:00', session_mode: 'Both', active: true }] };
    }
    return { Items: [] };
  });
}

beforeEach(() => {
  ddbMock.reset();
  setupMocks();
});

describe('GET /api/dashboard — tutee (spec section 8)', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns latest and previous attempts with the improvement delta', async () => {
    const res = await request(app).get('/api/dashboard')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.latest_attempt.score).toBe(9);
    expect(res.body.data.previous_attempt.score).toBe(7);
    expect(res.body.data.improvement_delta).toBe(20);
    expect(res.body.data.attempt_count).toBe(2);
  });

  it('lists weak topics weakest-first with the spec\'s figures', async () => {
    const res = await request(app).get('/api/dashboard')
      .set('Authorization', `Bearer ${JINYU}`);

    const weak = res.body.data.weak_topics;
    expect(weak.map((t) => t.topic)).toEqual(['Certificates', 'Digital Signatures']);
    expect(weak[0].score_percentage).toBe(40);
    expect(weak[1].score_percentage).toBe(50);
  });

  it('recommends a verified tutor with a match score and reasons', async () => {
    const res = await request(app).get('/api/dashboard')
      .set('Authorization', `Bearer ${JINYU}`);

    const rec = res.body.data.recommended_tutor;
    expect(rec).toBeTruthy();
    expect(rec.user.full_name).toBe('Alex Tan');
    expect(rec.match.score).toBeGreaterThan(0);
    expect(rec.match.reasons).toContain('Verified for IT2513');
    expect(rec.user.password_hash).toBeUndefined();
  });

  it('handles a brand-new student with no attempts', async () => {
    ddbMock.reset();
    setupMocks({ attempts: [], topicPerf: [] });

    const res = await request(app).get('/api/dashboard')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.latest_attempt).toBeNull();
    expect(res.body.data.improvement_delta).toBeNull();
    expect(res.body.data.weak_topics).toEqual([]);
    expect(res.body.data.recommended_tutor).toBeNull();
  });

  it('reports no upcoming session when the student has none', async () => {
    const res = await request(app).get('/api/dashboard')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.body.data.next_session).toBeNull();
    expect(res.body.data.upcoming_session_count).toBe(0);
  });
});

describe('GET /api/dashboard — tutor (spec section 19)', () => {
  it('returns the five dashboard stat values', async () => {
    const res = await request(app).get('/api/dashboard')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
    const { stats } = res.body.data;
    expect(stats.pending_request_count).toBe(0);
    expect(stats.upcoming_session_count).toBe(0);
    expect(stats.students_helped).toBe(41);
    expect(stats.average_rating).toBe(4.8);
    expect(stats.tutoring_hours).toBe(24); // 1440 minutes
  });

  it('does not leak the tutor\'s password hash', async () => {
    const res = await request(app).get('/api/dashboard')
      .set('Authorization', `Bearer ${ALEX}`);
    expect(res.body.data.user.password_hash).toBeUndefined();
  });
});

describe('GET /api/dashboard — role separation', () => {
  it('is not available to an admin (admins have their own dashboard)', async () => {
    const res = await request(app).get('/api/dashboard')
      .set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(403);
  });
});
