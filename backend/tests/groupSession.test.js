const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(id, role) {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const ALEX = tokenFor('user_alex', 'Tutor');
const JINYU = tokenFor('user_jinyu', 'Tutee');
const FARHAN = tokenFor('user_farhan', 'Tutee');

const IT2513 = { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' };
const ALEX_PROFILE = {
  id: 'tutorprofile_alex', user_id: 'user_alex', maximum_group_size: 5,
  physical_enabled: true, online_enabled: true, average_rating: 4.8,
};

const GROUP_SESSION = {
  id: 'session_group', booking_id: null, tutor_id: 'tutorprofile_alex',
  module_id: 'module_it2513', title: 'IT2513 Crypto Revision',
  topics: ['Digital Signatures', 'Certificates'],
  date: '2026-08-26', start_time: '15:00', end_time: '16:30',
  session_mode: 'Online', location: 'Online (in-app)',
  maximum_students: 5, status: 'Upcoming', attendance_verified: false,
};

// A private, booking-derived session that must never be joinable.
const PRIVATE_SESSION = {
  ...GROUP_SESSION, id: 'session_private', booking_id: 'booking_1', maximum_students: 1,
};

let putItems = [];
let deletedIds = [];

function setupMocks({
  sessions = [GROUP_SESSION],
  participants = [],
  verificationStatus = 'Verified',
  profile = ALEX_PROFILE,
} = {}) {
  putItems = [];
  deletedIds = [];

  ddbMock.on(ScanCommand).callsFake((input) => {
    if (input.TableName === env.tables.sessions) return { Items: sessions };
    return { Items: [] };
  });

  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.sessions) {
      return { Item: sessions.find((s) => s.id === input.Key.id) || null };
    }
    if (input.TableName === env.tables.modules) return { Item: IT2513 };
    if (input.TableName === env.tables.tutorProfiles) return { Item: profile };
    if (input.TableName === env.tables.users) {
      const names = { user_alex: 'Alex Tan', user_jinyu: 'Jinyu Chen', user_farhan: 'Farhan Rahman' };
      return { Item: { id: input.Key.id, full_name: names[input.Key.id] || 'User', course: 'IT' } };
    }
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.sessionParticipants && input.IndexName === 'sessionId-index') {
      return { Items: participants };
    }
    if (input.TableName === env.tables.tutorProfiles && input.IndexName === 'userId-index') {
      const uid = input.ExpressionAttributeValues[':uid'];
      return { Items: uid === 'user_alex' && profile ? [profile] : [] };
    }
    if (input.TableName === env.tables.tutorVerifications) {
      return { Items: [{ id: 'v1', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', status: verificationStatus }] };
    }
    if (input.TableName === env.tables.sessions && input.IndexName === 'tutorId-index') {
      return { Items: sessions };
    }
    return { Items: [] };
  });

  ddbMock.on(PutCommand).callsFake((input) => {
    putItems.push({ table: input.TableName, item: input.Item });
    return {};
  });

  ddbMock.on(DeleteCommand).callsFake((input) => {
    deletedIds.push(input.Key.id);
    return {};
  });
}

const VALID_GROUP_PAYLOAD = {
  title: 'IT2513 Crypto Revision',
  module_id: 'module_it2513',
  topics: ['Digital Signatures', 'Certificates'],
  date: '2026-09-02',
  start_time: '15:00',
  end_time: '16:30',
  session_mode: 'Online',
  location: 'Online (in-app)',
  maximum_students: 5,
};

beforeEach(() => {
  ddbMock.reset();
  setupMocks();
});

describe('POST /api/sessions/group — creation', () => {
  it('lets a verified tutor create a group session', async () => {
    ddbMock.reset();
    setupMocks({ sessions: [] }); // no clash

    const res = await request(app).post('/api/sessions/group')
      .set('Authorization', `Bearer ${ALEX}`)
      .send(VALID_GROUP_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.data.session.title).toBe('IT2513 Crypto Revision');
    expect(res.body.data.session.status).toBe('Upcoming');
    expect(res.body.data.session.maximum_students).toBe(5);
    // No booking means it's a browsable group session rather than a private one.
    expect(res.body.data.session.booking_id).toBeNull();
  });

  it('refuses a tutor not verified for the module (business rule 1)', async () => {
    ddbMock.reset();
    setupMocks({ sessions: [], verificationStatus: 'Pending' });

    const res = await request(app).post('/api/sessions/group')
      .set('Authorization', `Bearer ${ALEX}`)
      .send(VALID_GROUP_PAYLOAD);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not verified/i);
  });

  it('refuses capacity above the tutor\'s declared maximum group size', async () => {
    ddbMock.reset();
    setupMocks({ sessions: [] });

    const res = await request(app).post('/api/sessions/group')
      .set('Authorization', `Bearer ${ALEX}`)
      .send({ ...VALID_GROUP_PAYLOAD, maximum_students: 20 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/maximum group size/i);
  });

  it('refuses a capacity of 1 (that would not be a group)', async () => {
    ddbMock.reset();
    setupMocks({ sessions: [] });

    const res = await request(app).post('/api/sessions/group')
      .set('Authorization', `Bearer ${ALEX}`)
      .send({ ...VALID_GROUP_PAYLOAD, maximum_students: 1 });

    expect(res.status).toBe(400);
  });

  it('refuses a session that clashes with the tutor\'s existing schedule', async () => {
    ddbMock.reset();
    setupMocks({
      sessions: [{ ...GROUP_SESSION, date: '2026-09-02', start_time: '15:30', end_time: '17:00' }],
    });

    const res = await request(app).post('/api/sessions/group')
      .set('Authorization', `Bearer ${ALEX}`)
      .send(VALID_GROUP_PAYLOAD);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/clashes/i);
  });

  it('refuses an inverted time range', async () => {
    ddbMock.reset();
    setupMocks({ sessions: [] });

    const res = await request(app).post('/api/sessions/group')
      .set('Authorization', `Bearer ${ALEX}`)
      .send({ ...VALID_GROUP_PAYLOAD, start_time: '17:00', end_time: '15:00' });

    expect(res.status).toBe(400);
  });

  it('refuses a physical session when the tutor does not offer physical', async () => {
    ddbMock.reset();
    setupMocks({ sessions: [], profile: { ...ALEX_PROFILE, physical_enabled: false } });

    const res = await request(app).post('/api/sessions/group')
      .set('Authorization', `Bearer ${ALEX}`)
      .send({ ...VALID_GROUP_PAYLOAD, session_mode: 'Physical' });

    expect(res.status).toBe(400);
  });

  it('does not let a student create a group session', async () => {
    const res = await request(app).post('/api/sessions/group')
      .set('Authorization', `Bearer ${JINYU}`)
      .send(VALID_GROUP_PAYLOAD);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/sessions/group — browsing', () => {
  it('lists open group sessions with participant counts and capacity', async () => {
    ddbMock.reset();
    setupMocks({
      participants: [
        { id: 'p1', session_id: 'session_group', student_id: 'user_meiling' },
        { id: 'p2', session_id: 'session_group', student_id: 'user_farhan' },
        { id: 'p3', session_id: 'session_group', student_id: 'user_other' },
      ],
    });

    const res = await request(app).get('/api/sessions/group')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    const [session] = res.body.data.sessions;
    // Matches the spec's "3 / 5" display.
    expect(session.participant_count).toBe(3);
    expect(session.capacity).toBe(5);
    expect(session.spots_left).toBe(2);
    expect(session.is_full).toBe(false);
    expect(session.has_joined).toBe(false);
    expect(session.tutor.full_name).toBe('Alex Tan');
    expect(session.module.module_code).toBe('IT2513');
  });

  it('flags has_joined for a session the viewer is already in', async () => {
    ddbMock.reset();
    setupMocks({ participants: [{ id: 'p1', session_id: 'session_group', student_id: 'user_jinyu' }] });

    const res = await request(app).get('/api/sessions/group')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.body.data.sessions[0].has_joined).toBe(true);
  });

  it('excludes private booking-derived sessions from browsing', async () => {
    ddbMock.reset();
    setupMocks({ sessions: [GROUP_SESSION, PRIVATE_SESSION] });

    const res = await request(app).get('/api/sessions/group')
      .set('Authorization', `Bearer ${JINYU}`);

    const ids = res.body.data.sessions.map((s) => s.id);
    expect(ids).toContain('session_group');
    expect(ids).not.toContain('session_private');
  });

  it('excludes sessions that are no longer Upcoming by default', async () => {
    ddbMock.reset();
    setupMocks({
      sessions: [GROUP_SESSION, { ...GROUP_SESSION, id: 'session_done', status: 'Completed' }],
    });

    const res = await request(app).get('/api/sessions/group')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.body.data.sessions.map((s) => s.id)).toEqual(['session_group']);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/sessions/group');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/sessions/group/:id/join — the three spec conditions', () => {
  it('joins an open session with spare capacity', async () => {
    const res = await request(app).post('/api/sessions/group/session_group/join')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.participant.student_id).toBe('user_jinyu');
    expect(res.body.data.participant.attendance_status).toBe('Registered');
    expect(res.body.data.session.participant_count).toBe(0); // count reflects pre-join snapshot
  });

  it('condition 1: refuses to join a session that is not active', async () => {
    ddbMock.reset();
    setupMocks({ sessions: [{ ...GROUP_SESSION, status: 'In Progress' }] });

    const res = await request(app).post('/api/sessions/group/session_group/join')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no longer be joined/i);
  });

  it('condition 2: refuses to join when capacity is reached', async () => {
    ddbMock.reset();
    setupMocks({
      sessions: [{ ...GROUP_SESSION, maximum_students: 2 }],
      participants: [
        { id: 'p1', session_id: 'session_group', student_id: 'user_a' },
        { id: 'p2', session_id: 'session_group', student_id: 'user_b' },
      ],
    });

    const res = await request(app).post('/api/sessions/group/session_group/join')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already full/i);
  });

  it('condition 3: refuses a duplicate join', async () => {
    ddbMock.reset();
    setupMocks({ participants: [{ id: 'p1', session_id: 'session_group', student_id: 'user_jinyu' }] });

    const res = await request(app).post('/api/sessions/group/session_group/join')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already joined/i);
  });

  it('refuses to join a private booking-derived session', async () => {
    ddbMock.reset();
    setupMocks({ sessions: [PRIVATE_SESSION] });

    const res = await request(app).post('/api/sessions/group/session_private/join')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/private/i);
  });

  it('404s for a session that does not exist', async () => {
    const res = await request(app).post('/api/sessions/group/nope/join')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(404);
  });

  it('does not let a tutor join a group session as a participant', async () => {
    const res = await request(app).post('/api/sessions/group/session_group/join')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(403);
  });

  it('creates exactly one participant row per join', async () => {
    await request(app).post('/api/sessions/group/session_group/join')
      .set('Authorization', `Bearer ${JINYU}`);

    const participantWrites = putItems.filter((p) => p.table === env.tables.sessionParticipants);
    expect(participantWrites).toHaveLength(1);
    expect(participantWrites[0].item.session_id).toBe('session_group');
  });
});

describe('POST /api/sessions/group/:id/leave', () => {
  it('lets a participant leave an upcoming group session', async () => {
    ddbMock.reset();
    setupMocks({ participants: [{ id: 'p_jinyu', session_id: 'session_group', student_id: 'user_jinyu' }] });

    const res = await request(app).post('/api/sessions/group/session_group/leave')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(deletedIds).toContain('p_jinyu');
  });

  it('refuses to leave once the session has started', async () => {
    ddbMock.reset();
    setupMocks({
      sessions: [{ ...GROUP_SESSION, status: 'In Progress' }],
      participants: [{ id: 'p_jinyu', session_id: 'session_group', student_id: 'user_jinyu' }],
    });

    const res = await request(app).post('/api/sessions/group/session_group/leave')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(409);
  });

  it('refuses when the caller is not a participant', async () => {
    const res = await request(app).post('/api/sessions/group/session_group/leave')
      .set('Authorization', `Bearer ${FARHAN}`);

    expect(res.status).toBe(403);
  });
});
