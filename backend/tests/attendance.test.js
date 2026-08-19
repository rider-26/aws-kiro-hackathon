const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const attendanceService = require('../src/services/attendanceService');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(id, role) {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const ALEX = tokenFor('user_alex', 'Tutor');      // session tutor
const MARCUS = tokenFor('user_marcus', 'Tutor');  // a different tutor
const JINYU = tokenFor('user_jinyu', 'Tutee');    // participant
const FARHAN = tokenFor('user_farhan', 'Tutee');  // not a participant

const BASE_SESSION = {
  id: 'session_1', booking_id: 'booking_1', tutor_id: 'tutorprofile_alex',
  module_id: 'module_it2513', title: 'IT2513 — Digital Signatures',
  date: '2026-08-19', start_time: '15:00', end_time: '16:00',
  session_mode: 'Online', status: 'Upcoming', maximum_students: 1,
};

const BASE_PARTICIPANT = {
  id: 'participant_1', session_id: 'session_1', student_id: 'user_jinyu',
  attendance_status: 'Registered', check_in_time: null,
  check_out_time: null, completion_confirmed: false,
};

let sessionUpdates = [];
let participantUpdates = [];
let bookingUpdates = [];

function setupMocks({ session = {}, participants = [BASE_PARTICIPANT], recognitionRules = null } = {}) {
  sessionUpdates = [];
  participantUpdates = [];
  bookingUpdates = [];

  const theSession = { ...BASE_SESSION, ...session };
  let participantRows = participants.map((p) => ({ ...p }));

  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.sessions) return { Item: theSession };
    if (input.TableName === env.tables.tutorProfiles) {
      if (input.Key.id === 'tutorprofile_alex') return { Item: { id: 'tutorprofile_alex', user_id: 'user_alex' } };
      return { Item: null };
    }
    if (input.TableName === env.tables.sessionParticipants) {
      return { Item: participantRows.find((p) => p.id === input.Key.id) || null };
    }
    if (input.TableName === env.tables.users) {
      return { Item: { id: input.Key.id, full_name: 'Test User', role: 'Tutee' } };
    }
    if (input.TableName === env.tables.modules) {
      return { Item: { id: 'module_it2513', module_code: 'IT2513' } };
    }
    if (input.TableName === env.tables.bookings) {
      return { Item: { id: 'booking_1', student_id: 'user_jinyu', status: 'Accepted' } };
    }
    if (input.TableName === env.tables.recognitionRules) {
      return { Item: recognitionRules };
    }
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.sessionParticipants && input.IndexName === 'sessionId-index') {
      return { Items: participantRows };
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

  ddbMock.on(UpdateCommand).callsFake((input) => {
    const values = input.ExpressionAttributeValues || {};
    const names = input.ExpressionAttributeNames || {};
    const patch = {};
    for (const [placeholder, value] of Object.entries(values)) {
      const key = placeholder.replace(':', '');
      patch[names[`#${key}`] || key] = value;
    }

    if (input.TableName === env.tables.sessions) {
      sessionUpdates.push(patch);
      Object.assign(theSession, patch);
      return { Attributes: { ...theSession } };
    }
    if (input.TableName === env.tables.sessionParticipants) {
      participantUpdates.push({ id: input.Key.id, ...patch });
      participantRows = participantRows.map((p) => (p.id === input.Key.id ? { ...p, ...patch } : p));
      return { Attributes: participantRows.find((p) => p.id === input.Key.id) };
    }
    if (input.TableName === env.tables.bookings) {
      bookingUpdates.push(patch);
      return { Attributes: { id: 'booking_1', ...patch } };
    }
    return { Attributes: patch };
  });
}

beforeEach(() => {
  ddbMock.reset();
  setupMocks();
});

describe('pure helpers', () => {
  it('computes duration in whole minutes', () => {
    expect(attendanceService.durationMinutes('2026-08-19T15:00:00.000Z', '2026-08-19T15:45:00.000Z')).toBe(45);
  });

  it('returns 0 duration for a missing or inverted range', () => {
    expect(attendanceService.durationMinutes(null, '2026-08-19T15:45:00.000Z')).toBe(0);
    expect(attendanceService.durationMinutes('2026-08-19T16:00:00.000Z', '2026-08-19T15:00:00.000Z')).toBe(0);
  });

  it('generates a six-character check-in token', () => {
    const token = attendanceService.generateCheckInToken();
    expect(token).toHaveLength(6);
    expect(token).toMatch(/^[0-9A-F]{6}$/);
  });

  it('requires BOTH check-in and confirmation for verified attendance', () => {
    expect(attendanceService.computeVerified([{ check_in_time: 't', completion_confirmed: true }])).toBe(true);
    expect(attendanceService.computeVerified([{ check_in_time: 't', completion_confirmed: false }])).toBe(false);
    expect(attendanceService.computeVerified([{ check_in_time: null, completion_confirmed: true }])).toBe(false);
    expect(attendanceService.computeVerified([])).toBe(false);
  });
});

describe('POST /api/sessions/:id/start', () => {
  it('lets the session tutor start an upcoming session and issues a token', async () => {
    const res = await request(app).post('/api/sessions/session_1/start')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
    expect(res.body.data.session.status).toBe('In Progress');
    expect(res.body.data.session.start_timestamp).toBeTruthy();
    expect(res.body.data.session.check_in_token).toMatch(/^[0-9A-F]{6}$/);
  });

  it('refuses a tutor who does not run this session', async () => {
    const res = await request(app).post('/api/sessions/session_1/start')
      .set('Authorization', `Bearer ${MARCUS}`);
    expect(res.status).toBe(403);
  });

  it('refuses a student', async () => {
    const res = await request(app).post('/api/sessions/session_1/start')
      .set('Authorization', `Bearer ${JINYU}`);
    expect(res.status).toBe(403);
  });

  it('refuses to start a session twice', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'In Progress' } });

    const res = await request(app).post('/api/sessions/session_1/start')
      .set('Authorization', `Bearer ${ALEX}`);
    expect(res.status).toBe(409);
  });

  it('refuses to start a cancelled session', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'Cancelled' } });

    const res = await request(app).post('/api/sessions/session_1/start')
      .set('Authorization', `Bearer ${ALEX}`);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/sessions/:id/check-in', () => {
  it('records a check-in when the token matches', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'In Progress', check_in_token: 'ABC123', start_timestamp: '2026-08-19T15:00:00.000Z' } });

    const res = await request(app).post('/api/sessions/session_1/check-in')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ token: 'ABC123' });

    expect(res.status).toBe(200);
    expect(res.body.data.participant.attendance_status).toBe('Checked In');
    expect(res.body.data.participant.check_in_time).toBeTruthy();
  });

  it('accepts a lower-case token', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'In Progress', check_in_token: 'ABC123' } });

    const res = await request(app).post('/api/sessions/session_1/check-in')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ token: 'abc123' });

    expect(res.status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'In Progress', check_in_token: 'ABC123' } });

    const res = await request(app).post('/api/sessions/session_1/check-in')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ token: 'WRONG1' });

    expect(res.status).toBe(400);
  });

  it('requires a token', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'In Progress', check_in_token: 'ABC123' } });

    const res = await request(app).post('/api/sessions/session_1/check-in')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('refuses check-in before the session starts', async () => {
    const res = await request(app).post('/api/sessions/session_1/check-in')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ token: 'ABC123' });

    expect(res.status).toBe(409);
  });

  it('refuses check-in from a non-participant', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'In Progress', check_in_token: 'ABC123' } });

    const res = await request(app).post('/api/sessions/session_1/check-in')
      .set('Authorization', `Bearer ${FARHAN}`)
      .send({ token: 'ABC123' });

    expect(res.status).toBe(403);
  });

  it('is idempotent when the student scans twice', async () => {
    ddbMock.reset();
    setupMocks({
      session: { status: 'In Progress', check_in_token: 'ABC123' },
      participants: [{ ...BASE_PARTICIPANT, check_in_time: '2026-08-19T15:05:00.000Z', attendance_status: 'Checked In' }],
    });

    const res = await request(app).post('/api/sessions/session_1/check-in')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ token: 'ABC123' });

    expect(res.status).toBe(200);
    expect(participantUpdates).toHaveLength(0); // no duplicate write
  });
});

describe('POST /api/sessions/:id/end', () => {
  it('ends the session, stores duration, and marks it Completed', async () => {
    const startedAt = new Date(Date.now() - 45 * 60000).toISOString();
    ddbMock.reset();
    setupMocks({
      session: { status: 'In Progress', start_timestamp: startedAt, check_in_token: 'ABC123' },
      participants: [{ ...BASE_PARTICIPANT, check_in_time: startedAt, attendance_status: 'Checked In' }],
    });

    const res = await request(app).post('/api/sessions/session_1/end')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
    expect(res.body.data.session.status).toBe('Completed');
    expect(res.body.data.session.end_timestamp).toBeTruthy();
    expect(res.body.data.session.duration_minutes).toBeGreaterThanOrEqual(44);
    expect(res.body.data.session.duration_minutes).toBeLessThanOrEqual(46);
  });

  it('marks a participant who never checked in as Absent', async () => {
    ddbMock.reset();
    setupMocks({
      session: { status: 'In Progress', start_timestamp: new Date(Date.now() - 30 * 60000).toISOString() },
      participants: [BASE_PARTICIPANT], // never checked in
    });

    await request(app).post('/api/sessions/session_1/end')
      .set('Authorization', `Bearer ${ALEX}`);

    const absent = participantUpdates.find((u) => u.attendance_status === 'Absent');
    expect(absent).toBeTruthy();
  });

  it('cascades the linked booking to Completed', async () => {
    ddbMock.reset();
    setupMocks({
      session: { status: 'In Progress', start_timestamp: new Date(Date.now() - 30 * 60000).toISOString() },
    });

    await request(app).post('/api/sessions/session_1/end')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(bookingUpdates).toEqual([{ status: 'Completed' }]);
  });

  it('leaves attendance unverified when nobody confirmed completion', async () => {
    const startedAt = new Date(Date.now() - 40 * 60000).toISOString();
    ddbMock.reset();
    setupMocks({
      session: { status: 'In Progress', start_timestamp: startedAt },
      participants: [{ ...BASE_PARTICIPANT, check_in_time: startedAt, attendance_status: 'Checked In' }],
    });

    const res = await request(app).post('/api/sessions/session_1/end')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.body.data.session.attendance_verified).toBe(false);
  });

  it('refuses to end a session that was never started', async () => {
    const res = await request(app).post('/api/sessions/session_1/end')
      .set('Authorization', `Bearer ${ALEX}`);
    expect(res.status).toBe(409);
  });

  it('refuses a tutor who does not run this session', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'In Progress' } });

    const res = await request(app).post('/api/sessions/session_1/end')
      .set('Authorization', `Bearer ${MARCUS}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/sessions/:id/confirm-completion', () => {
  const completedSession = {
    status: 'Completed',
    start_timestamp: '2026-08-19T15:00:00.000Z',
    end_timestamp: '2026-08-19T15:45:00.000Z',
    duration_minutes: 45,
  };

  it('confirms completion and flips attendance to verified', async () => {
    ddbMock.reset();
    setupMocks({
      session: completedSession,
      participants: [{ ...BASE_PARTICIPANT, check_in_time: '2026-08-19T15:05:00.000Z', attendance_status: 'Checked In' }],
    });

    const res = await request(app).post('/api/sessions/session_1/confirm-completion')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.participant.completion_confirmed).toBe(true);
    expect(res.body.data.participant.attendance_status).toBe('Attended');
    // The session row is updated to reflect verified attendance.
    expect(sessionUpdates.some((u) => u.attendance_verified === true)).toBe(true);
  });

  it('refuses confirmation from someone who never checked in', async () => {
    ddbMock.reset();
    setupMocks({ session: completedSession, participants: [BASE_PARTICIPANT] });

    const res = await request(app).post('/api/sessions/session_1/confirm-completion')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(409);
  });

  it('refuses confirmation before the tutor ends the session', async () => {
    ddbMock.reset();
    setupMocks({
      session: { status: 'In Progress', start_timestamp: '2026-08-19T15:00:00.000Z' },
      participants: [{ ...BASE_PARTICIPANT, check_in_time: '2026-08-19T15:05:00.000Z' }],
    });

    const res = await request(app).post('/api/sessions/session_1/confirm-completion')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(409);
  });

  it('refuses confirmation from a non-participant', async () => {
    ddbMock.reset();
    setupMocks({ session: completedSession });

    const res = await request(app).post('/api/sessions/session_1/confirm-completion')
      .set('Authorization', `Bearer ${FARHAN}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/sessions/:id/attendance', () => {
  it('shows the tutor the check-in token', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'In Progress', check_in_token: 'ABC123' } });

    const res = await request(app).get('/api/sessions/session_1/attendance')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_tutor).toBe(true);
    expect(res.body.data.check_in_token).toBe('ABC123');
  });

  it('does not expose the token in the student payload', async () => {
    ddbMock.reset();
    setupMocks({ session: { status: 'In Progress', check_in_token: 'ABC123' } });

    const res = await request(app).get('/api/sessions/session_1/attendance')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_tutor).toBe(false);
    expect(res.body.data.check_in_token).toBeUndefined();
  });

  it('includes the recognition eligibility breakdown', async () => {
    ddbMock.reset();
    setupMocks({
      session: { status: 'Completed', attendance_verified: true, duration_minutes: 45 },
      participants: [{ ...BASE_PARTICIPANT, check_in_time: 'x', completion_confirmed: true }],
    });

    const res = await request(app).get('/api/sessions/session_1/attendance')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.body.data.recognition.criteria).toHaveLength(3);
    expect(res.body.data.recognition.status).toBe('Pending Lecturer Approval');
  });

  it('denies a non-member', async () => {
    const res = await request(app).get('/api/sessions/session_1/attendance')
      .set('Authorization', `Bearer ${FARHAN}`);
    expect(res.status).toBe(403);
  });
});
