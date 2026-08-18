const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(id, role) {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

// Jinyu is a participant; Alex is the session's tutor; Farhan is unrelated;
// Marcus is a tutor but of a DIFFERENT session; Ms Lim is an admin.
const JINYU = tokenFor('user_jinyu', 'Tutee');
const ALEX = tokenFor('user_alex', 'Tutor');
const FARHAN = tokenFor('user_farhan', 'Tutee');
const MARCUS = tokenFor('user_marcus', 'Tutor');
const ADMIN = tokenFor('user_lim', 'Admin');

const SESSION = {
  id: 'session_1', booking_id: 'booking_1', tutor_id: 'tutorprofile_alex',
  module_id: 'module_it2513', title: 'IT2513 — Digital Signatures',
  date: '2026-08-19', start_time: '15:00', end_time: '16:00',
  session_mode: 'Online', status: 'Upcoming', maximum_students: 1,
};

const PARTICIPANTS = [
  { id: 'participant_1', session_id: 'session_1', student_id: 'user_jinyu', attendance_status: 'Registered' },
];

const MESSAGES = [
  { id: 'm2', session_id: 'session_1', sender_id: 'user_alex', message: 'Sure, bring your notes.', created_date: '2026-08-18T10:05:00.000Z' },
  { id: 'm1', session_id: 'session_1', sender_id: 'user_jinyu', message: 'Hi, can we cover certificates?', created_date: '2026-08-18T10:00:00.000Z' },
];

function setupMocks({ sessionStatus = 'Upcoming' } = {}) {
  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.sessions) {
      return { Item: { ...SESSION, status: sessionStatus } };
    }
    if (input.TableName === env.tables.tutorProfiles) {
      if (input.Key.id === 'tutorprofile_alex') return { Item: { id: 'tutorprofile_alex', user_id: 'user_alex' } };
      return { Item: null };
    }
    if (input.TableName === env.tables.users) {
      const names = {
        user_jinyu: 'Jinyu Chen', user_alex: 'Alex Tan',
        user_farhan: 'Farhan Rahman', user_marcus: 'Marcus Wong',
      };
      return { Item: { id: input.Key.id, full_name: names[input.Key.id] || 'User', role: 'Tutee', password_hash: 'secret-hash' } };
    }
    if (input.TableName === env.tables.modules) {
      return { Item: { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' } };
    }
    if (input.TableName === env.tables.bookings) {
      return { Item: { id: 'booking_1', student_id: 'user_jinyu', status: 'Accepted' } };
    }
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.sessionParticipants && input.IndexName === 'sessionId-index') {
      return { Items: PARTICIPANTS };
    }
    if (input.TableName === env.tables.chatMessages) {
      return { Items: MESSAGES };
    }
    if (input.TableName === env.tables.tutorProfiles && input.IndexName === 'userId-index') {
      const uid = input.ExpressionAttributeValues[':uid'];
      if (uid === 'user_alex') return { Items: [{ id: 'tutorprofile_alex', user_id: 'user_alex' }] };
      if (uid === 'user_marcus') return { Items: [{ id: 'tutorprofile_marcus', user_id: 'user_marcus' }] };
      return { Items: [] };
    }
    return { Items: [] };
  });

  ddbMock.on(PutCommand).resolves({});
}

beforeEach(() => {
  ddbMock.reset();
  setupMocks();
});

describe('GET /api/sessions/:id/messages — business rule 6 (members only)', () => {
  it('allows the participating student to read messages', async () => {
    const res = await request(app).get('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.messages).toHaveLength(2);
  });

  it('allows the session tutor to read messages', async () => {
    const res = await request(app).get('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
    expect(res.body.data.messages).toHaveLength(2);
  });

  it('denies an unrelated student', async () => {
    const res = await request(app).get('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${FARHAN}`);

    expect(res.status).toBe(403);
  });

  it('denies a tutor who is not this session\'s tutor', async () => {
    const res = await request(app).get('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${MARCUS}`);

    expect(res.status).toBe(403);
  });

  it('denies an admin (oversight happens through admin session records, not private chat)', async () => {
    const res = await request(app).get('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/sessions/session_1/messages');
    expect(res.status).toBe(401);
  });

  it('returns messages oldest-first with sender details and no password hashes', async () => {
    const res = await request(app).get('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${JINYU}`);

    const [first, second] = res.body.data.messages;
    expect(first.id).toBe('m1');
    expect(second.id).toBe('m2');
    expect(first.sender.full_name).toBe('Jinyu Chen');
    expect(first.sender.password_hash).toBeUndefined();
  });
});

describe('POST /api/sessions/:id/messages', () => {
  it('lets a participant post a message', async () => {
    const res = await request(app).post('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ message: 'See you Wednesday!' });

    expect(res.status).toBe(201);
    expect(res.body.data.message.message).toBe('See you Wednesday!');
    expect(res.body.data.message.sender_id).toBe('user_jinyu');
  });

  it('lets the session tutor post a message', async () => {
    const res = await request(app).post('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${ALEX}`)
      .send({ message: 'Bring your lecture notes.' });

    expect(res.status).toBe(201);
  });

  it('denies a non-member posting', async () => {
    const res = await request(app).post('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${FARHAN}`)
      .send({ message: 'Let me in' });

    expect(res.status).toBe(403);
  });

  it('rejects an empty message', async () => {
    const res = await request(app).post('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ message: '   ' });

    expect(res.status).toBe(400);
  });

  it('rejects an over-long message', async () => {
    const res = await request(app).post('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ message: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
  });

  it('refuses to post to a cancelled session', async () => {
    ddbMock.reset();
    setupMocks({ sessionStatus: 'Cancelled' });

    const res = await request(app).post('/api/sessions/session_1/messages')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ message: 'Still there?' });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns hydrated session detail for a member', async () => {
    const res = await request(app).get('/api/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.session.module.module_code).toBe('IT2513');
    expect(res.body.data.session.tutor.user.full_name).toBe('Alex Tan');
    expect(res.body.data.session.participant_count).toBe(1);
  });

  it('denies a non-member', async () => {
    const res = await request(app).get('/api/sessions/session_1')
      .set('Authorization', `Bearer ${FARHAN}`);

    expect(res.status).toBe(403);
  });
});
