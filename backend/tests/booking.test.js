const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(role, id) {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const STUDENT_TOKEN = tokenFor('Tutee', 'user_jinyu');
const TUTOR_TOKEN = tokenFor('Tutor', 'user_alex');

const IT2513 = { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' };
const ALEX_PROFILE = {
  id: 'tutorprofile_alex', user_id: 'user_alex',
  maximum_group_size: 5, physical_enabled: true, online_enabled: true,
};
// 2026-08-19 is a Wednesday; Alex is available Wednesday 13:00-16:00.
const WED_SLOT = {
  id: 'avail_1', tutor_id: 'tutorprofile_alex', day_or_date: 'Wednesday',
  start_time: '13:00', end_time: '16:00', session_mode: 'Both', active: true,
};

/**
 * Configures the DynamoDB mock. `overrides` lets individual tests swap in
 * different verification statuses, existing sessions, or booking states.
 */
function setupMocks({ verificationStatus = 'Verified', existingSessions = [], booking = null } = {}) {
  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.tutorProfiles) return { Item: ALEX_PROFILE };
    if (input.TableName === env.tables.modules) return { Item: IT2513 };
    if (input.TableName === env.tables.users) {
      return { Item: { id: input.Key.id, full_name: input.Key.id === 'user_alex' ? 'Alex Tan' : 'Jinyu Chen', role: 'Tutee' } };
    }
    if (input.TableName === env.tables.bookings) return { Item: booking };
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.tutorVerifications) {
      return { Items: [{ id: 'v1', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', status: verificationStatus }] };
    }
    if (input.TableName === env.tables.tutorAvailability) {
      return { Items: [WED_SLOT] };
    }
    if (input.TableName === env.tables.tutorProfiles && input.IndexName === 'userId-index') {
      return { Items: [ALEX_PROFILE] };
    }
    if (input.TableName === env.tables.sessions) {
      return { Items: existingSessions };
    }
    return { Items: [] };
  });

  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(UpdateCommand).callsFake((input) => ({
    Attributes: { ...booking, ...unwrapUpdate(input) },
  }));
}

// Reconstructs the patched attributes from an UpdateCommand for assertion purposes.
function unwrapUpdate(input) {
  const values = input.ExpressionAttributeValues || {};
  const names = input.ExpressionAttributeNames || {};
  const out = {};
  for (const [placeholder, value] of Object.entries(values)) {
    const key = placeholder.replace(':', '');
    const realName = names[`#${key}`] || key;
    out[realName] = value;
  }
  return out;
}

const VALID_BOOKING_BODY = {
  tutor_id: 'tutorprofile_alex',
  module_id: 'module_it2513',
  topics: ['Digital Signatures'],
  date: '2026-08-19', // Wednesday
  start_time: '15:00',
  end_time: '16:00',
  session_type: 'Individual',
  session_mode: 'Online',
  student_message: 'Struggling with signatures.',
};

beforeEach(() => {
  ddbMock.reset();
});

describe('POST /api/bookings — creation rules', () => {
  it('creates a Pending booking for a valid request', async () => {
    setupMocks();
    const res = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send(VALID_BOOKING_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.booking.status).toBe('Pending');
    expect(res.body.data.booking.student_id).toBe('user_jinyu');
  });

  it('rejects booking a tutor who is not Verified for the module (business rule 1)', async () => {
    setupMocks({ verificationStatus: 'Pending' });
    const res = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send(VALID_BOOKING_BODY);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not verified/i);
  });

  it('rejects a time outside the tutor\'s availability (business rule 4)', async () => {
    setupMocks();
    const res = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({ ...VALID_BOOKING_BODY, start_time: '18:00', end_time: '19:00' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/outside this tutor's availability/i);
  });

  it('rejects a booking on a day the tutor is not available', async () => {
    setupMocks();
    const res = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({ ...VALID_BOOKING_BODY, date: '2026-08-20' }); // Thursday

    expect(res.status).toBe(400);
  });

  it('rejects an inverted time range', async () => {
    setupMocks();
    const res = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({ ...VALID_BOOKING_BODY, start_time: '16:00', end_time: '15:00' });

    expect(res.status).toBe(400);
  });

  it('does not allow a Tutor to create a booking', async () => {
    setupMocks();
    const res = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${TUTOR_TOKEN}`)
      .send(VALID_BOOKING_BODY);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/bookings/:id/accept — conflict prevention', () => {
  const pendingBooking = {
    id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex',
    module_id: 'module_it2513', topics: ['Digital Signatures'],
    date: '2026-08-19', start_time: '15:00', end_time: '16:00',
    session_type: 'Individual', session_mode: 'Online', status: 'Pending',
  };

  it('accepts a booking and creates a session', async () => {
    setupMocks({ booking: pendingBooking });
    const res = await request(app).post('/api/bookings/booking_1/accept')
      .set('Authorization', `Bearer ${TUTOR_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('Accepted');
    expect(res.body.data.session.status).toBe('Upcoming');
    expect(res.body.data.session.booking_id).toBe('booking_1');
  });

  it('refuses to accept when it overlaps an existing Upcoming session (spec section 20)', async () => {
    setupMocks({
      booking: pendingBooking,
      existingSessions: [{
        id: 'session_existing', tutor_id: 'tutorprofile_alex', date: '2026-08-19',
        start_time: '15:30', end_time: '16:30', status: 'Upcoming',
      }],
    });

    const res = await request(app).post('/api/bookings/booking_1/accept')
      .set('Authorization', `Bearer ${TUTOR_TOKEN}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/clashes/i);
  });

  it('allows accepting when an existing session is on the same day but does not overlap', async () => {
    setupMocks({
      booking: pendingBooking,
      existingSessions: [{
        id: 'session_existing', tutor_id: 'tutorprofile_alex', date: '2026-08-19',
        start_time: '13:00', end_time: '14:00', status: 'Upcoming',
      }],
    });

    const res = await request(app).post('/api/bookings/booking_1/accept')
      .set('Authorization', `Bearer ${TUTOR_TOKEN}`);

    expect(res.status).toBe(200);
  });

  it('ignores a Cancelled session when checking for conflicts', async () => {
    setupMocks({
      booking: pendingBooking,
      existingSessions: [{
        id: 'session_cancelled', tutor_id: 'tutorprofile_alex', date: '2026-08-19',
        start_time: '15:00', end_time: '16:00', status: 'Cancelled',
      }],
    });

    const res = await request(app).post('/api/bookings/booking_1/accept')
      .set('Authorization', `Bearer ${TUTOR_TOKEN}`);

    expect(res.status).toBe(200);
  });

  it('refuses to accept a booking that is no longer Pending', async () => {
    setupMocks({ booking: { ...pendingBooking, status: 'Accepted' } });
    const res = await request(app).post('/api/bookings/booking_1/accept')
      .set('Authorization', `Bearer ${TUTOR_TOKEN}`);

    expect(res.status).toBe(409);
  });

  it('does not let a Tutee accept a booking', async () => {
    setupMocks({ booking: pendingBooking });
    const res = await request(app).post('/api/bookings/booking_1/accept')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/bookings/:id/decline', () => {
  const pendingBooking = {
    id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex',
    module_id: 'module_it2513', date: '2026-08-19', start_time: '15:00',
    end_time: '16:00', status: 'Pending',
  };

  it('declines with a valid reason', async () => {
    setupMocks({ booking: pendingBooking });
    const res = await request(app).post('/api/bookings/booking_1/decline')
      .set('Authorization', `Bearer ${TUTOR_TOKEN}`)
      .send({ decline_reason: 'Scheduling Conflict' });

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('Declined');
    expect(res.body.data.booking.decline_reason).toBe('Scheduling Conflict');
  });

  it('requires a decline reason', async () => {
    setupMocks({ booking: pendingBooking });
    const res = await request(app).post('/api/bookings/booking_1/decline')
      .set('Authorization', `Bearer ${TUTOR_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects an unrecognised decline reason', async () => {
    setupMocks({ booking: pendingBooking });
    const res = await request(app).post('/api/bookings/booking_1/decline')
      .set('Authorization', `Bearer ${TUTOR_TOKEN}`)
      .send({ decline_reason: 'Just because' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/bookings/:id/cancel', () => {
  it('lets the owning student cancel a Pending booking', async () => {
    setupMocks({ booking: { id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', status: 'Pending', date: '2026-08-19', start_time: '15:00' } });
    const res = await request(app).post('/api/bookings/booking_1/cancel')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('Cancelled');
  });

  it('refuses to cancel someone else\'s booking', async () => {
    setupMocks({ booking: { id: 'booking_1', student_id: 'user_someone_else', tutor_id: 'tutorprofile_alex', status: 'Pending' } });
    const res = await request(app).post('/api/bookings/booking_1/cancel')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it('refuses to cancel an already Completed booking', async () => {
    setupMocks({ booking: { id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', status: 'Completed' } });
    const res = await request(app).post('/api/bookings/booking_1/cancel')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(409);
  });
});

describe('GET /api/bookings/:id — access control', () => {
  it('denies a student access to a booking that is not theirs', async () => {
    setupMocks({ booking: { id: 'booking_1', student_id: 'user_other', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513' } });
    const res = await request(app).get('/api/bookings/booking_1')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(403);
  });
});
