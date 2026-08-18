const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const reviewService = require('../src/services/reviewService');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(id, role) {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const JINYU = tokenFor('user_jinyu', 'Tutee');
const FARHAN = tokenFor('user_farhan', 'Tutee');
const ALEX = tokenFor('user_alex', 'Tutor');

const COMPLETED_SESSION = {
  id: 'session_1', booking_id: 'booking_1', tutor_id: 'tutorprofile_alex',
  module_id: 'module_it2513', title: 'IT2513 — Digital Signatures',
  date: '2026-08-19', start_time: '15:00', end_time: '16:00',
  status: 'Completed', attendance_verified: true, duration_minutes: 45,
};

const VERIFIED_PARTICIPANT = {
  id: 'participant_1', session_id: 'session_1', student_id: 'user_jinyu',
  attendance_status: 'Attended', check_in_time: '2026-08-19T15:05:00.000Z',
  completion_confirmed: true,
};

const VALID_REVIEW = {
  knowledge_rating: 5,
  clarity_rating: 5,
  helpfulness_rating: 4,
  preparation_rating: 5,
  communication_rating: 4,
  overall_rating: 5,
  comment: 'Alex explained digital signatures really clearly.',
};

let reviewPuts = [];
let profileUpdates = [];

function setupMocks({
  session = COMPLETED_SESSION,
  participants = [VERIFIED_PARTICIPANT],
  existingReviews = [],
  tutorReviews = null,
} = {}) {
  reviewPuts = [];
  profileUpdates = [];

  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.sessions) return { Item: session };
    if (input.TableName === env.tables.tutorProfiles) {
      return { Item: { id: 'tutorprofile_alex', user_id: 'user_alex', average_rating: 4.8 } };
    }
    if (input.TableName === env.tables.users) {
      return { Item: { id: input.Key.id, full_name: 'Jinyu Chen', course: 'IT', role: 'Tutee', password_hash: 'secret' } };
    }
    if (input.TableName === env.tables.modules) {
      return { Item: { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' } };
    }
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.sessionParticipants && input.IndexName === 'sessionId-index') {
      return { Items: participants };
    }
    if (input.TableName === env.tables.reviews && input.IndexName === 'sessionId-index') {
      return { Items: existingReviews };
    }
    if (input.TableName === env.tables.reviews && input.IndexName === 'tutorId-index') {
      return { Items: tutorReviews ?? existingReviews };
    }
    if (input.TableName === env.tables.tutorProfiles && input.IndexName === 'userId-index') {
      const uid = input.ExpressionAttributeValues[':uid'];
      if (uid === 'user_alex') return { Items: [{ id: 'tutorprofile_alex', user_id: 'user_alex' }] };
      return { Items: [] };
    }
    return { Items: [] };
  });

  ddbMock.on(PutCommand).callsFake((input) => {
    if (input.TableName === env.tables.reviews) reviewPuts.push(input.Item);
    return {};
  });

  ddbMock.on(UpdateCommand).callsFake((input) => {
    const values = input.ExpressionAttributeValues || {};
    const names = input.ExpressionAttributeNames || {};
    const patch = {};
    for (const [placeholder, value] of Object.entries(values)) {
      const key = placeholder.replace(':', '');
      patch[names[`#${key}`] || key] = value;
    }
    if (input.TableName === env.tables.tutorProfiles) profileUpdates.push(patch);
    return { Attributes: { id: input.Key.id, ...patch } };
  });
}

beforeEach(() => {
  ddbMock.reset();
  setupMocks();
});

describe('POST /api/reviews/sessions/:sessionId — the four eligibility gates', () => {
  it('accepts a review when all four conditions are met', async () => {
    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send(VALID_REVIEW);

    expect(res.status).toBe(201);
    expect(res.body.data.review.overall_rating).toBe(5);
    expect(res.body.data.review.student_id).toBe('user_jinyu');
    expect(res.body.data.review.tutor_id).toBe('tutorprofile_alex');
    expect(res.body.data.review.verified_session).toBe(true);
  });

  it('gate 1: rejects a review when the session is not Completed', async () => {
    ddbMock.reset();
    setupMocks({ session: { ...COMPLETED_SESSION, status: 'In Progress' } });

    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send(VALID_REVIEW);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/completed/i);
  });

  it('gate 2: rejects a review from someone who was not a participant', async () => {
    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${FARHAN}`)
      .send(VALID_REVIEW);

    // Not a member at all, so membership resolution rejects first.
    expect(res.status).toBe(403);
  });

  it('gate 3: rejects a review when attendance was not verified', async () => {
    ddbMock.reset();
    setupMocks({ session: { ...COMPLETED_SESSION, attendance_verified: false } });

    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send(VALID_REVIEW);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/attendance/i);
  });

  it('gate 3b: rejects a review when the reviewer personally never checked in', async () => {
    ddbMock.reset();
    setupMocks({
      participants: [{ ...VERIFIED_PARTICIPANT, check_in_time: null, completion_confirmed: false }],
    });

    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send(VALID_REVIEW);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/confirm your attendance/i);
  });

  it('gate 4: rejects a duplicate review for the same session and student', async () => {
    ddbMock.reset();
    setupMocks({
      existingReviews: [{ id: 'review_existing', session_id: 'session_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', overall_rating: 4 }],
    });

    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send(VALID_REVIEW);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already reviewed/i);
  });

  it('allows a different student to review the same session', async () => {
    ddbMock.reset();
    setupMocks({
      participants: [
        VERIFIED_PARTICIPANT,
        { id: 'participant_2', session_id: 'session_1', student_id: 'user_meiling', attendance_status: 'Attended', check_in_time: 'x', completion_confirmed: true },
      ],
      existingReviews: [{ id: 'review_existing', session_id: 'session_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', overall_rating: 4 }],
    });

    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${tokenFor('user_meiling', 'Tutee')}`)
      .send(VALID_REVIEW);

    expect(res.status).toBe(201);
  });

  it('does not let a tutor submit a review', async () => {
    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${ALEX}`)
      .send(VALID_REVIEW);

    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/reviews/sessions/session_1').send(VALID_REVIEW);
    expect(res.status).toBe(401);
  });
});

describe('review payload validation', () => {
  it('rejects a missing rating dimension', async () => {
    const { clarity_rating, ...incomplete } = VALID_REVIEW;
    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send(incomplete);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/clarity_rating/);
  });

  it('rejects a rating above 5', async () => {
    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ ...VALID_REVIEW, overall_rating: 6 });

    expect(res.status).toBe(400);
  });

  it('rejects a rating below 1', async () => {
    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ ...VALID_REVIEW, knowledge_rating: 0 });

    expect(res.status).toBe(400);
  });

  it('rejects a non-integer rating', async () => {
    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ ...VALID_REVIEW, helpfulness_rating: 4.5 });

    expect(res.status).toBe(400);
  });

  it('rejects an over-long comment', async () => {
    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ ...VALID_REVIEW, comment: 'x'.repeat(1001) });

    expect(res.status).toBe(400);
  });

  it('accepts an empty comment', async () => {
    const res = await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ ...VALID_REVIEW, comment: '' });

    expect(res.status).toBe(201);
  });

  it('records all five dimensions plus overall', () => {
    expect(reviewService.RATING_FIELDS).toEqual([
      'knowledge_rating', 'clarity_rating', 'helpfulness_rating',
      'preparation_rating', 'communication_rating', 'overall_rating',
    ]);
  });
});

describe('tutor average rating recompute', () => {
  it('averages overall_rating across all of the tutor\'s reviews', async () => {
    ddbMock.reset();
    setupMocks({
      tutorReviews: [
        { id: 'r1', tutor_id: 'tutorprofile_alex', overall_rating: 5 },
        { id: 'r2', tutor_id: 'tutorprofile_alex', overall_rating: 4 },
        { id: 'r3', tutor_id: 'tutorprofile_alex', overall_rating: 4 },
      ],
    });

    await reviewService.recomputeTutorRating('tutorprofile_alex');

    // (5 + 4 + 4) / 3 = 4.333 -> 4.3
    expect(profileUpdates.at(-1)).toEqual({ average_rating: 4.3, review_count: 3 });
  });

  it('resets to zero when a tutor has no reviews', async () => {
    ddbMock.reset();
    setupMocks({ tutorReviews: [] });

    await reviewService.recomputeTutorRating('tutorprofile_alex');
    expect(profileUpdates.at(-1)).toEqual({ average_rating: 0, review_count: 0 });
  });

  it('rounds to one decimal place', async () => {
    ddbMock.reset();
    setupMocks({
      tutorReviews: [
        { id: 'r1', tutor_id: 'tutorprofile_alex', overall_rating: 5 },
        { id: 'r2', tutor_id: 'tutorprofile_alex', overall_rating: 4 },
      ],
    });

    await reviewService.recomputeTutorRating('tutorprofile_alex');
    expect(profileUpdates.at(-1).average_rating).toBe(4.5);
  });

  it('updates the tutor rating as part of submitting a review', async () => {
    await request(app).post('/api/reviews/sessions/session_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send(VALID_REVIEW);

    expect(profileUpdates.some((p) => p.average_rating !== undefined)).toBe(true);
  });
});

describe('GET /api/reviews/sessions/:sessionId/eligibility', () => {
  it('reports eligible for a verified completed participant', async () => {
    const res = await request(app).get('/api/reviews/sessions/session_1/eligibility')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.eligible).toBe(true);
    expect(res.body.data.reason).toBeNull();
  });

  it('reports the specific reason when not eligible', async () => {
    ddbMock.reset();
    setupMocks({ session: { ...COMPLETED_SESSION, status: 'Upcoming' } });

    const res = await request(app).get('/api/reviews/sessions/session_1/eligibility')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.body.data.eligible).toBe(false);
    expect(res.body.data.reason).toMatch(/completed/i);
  });
});

describe('business rule 8 — reviews are immutable', () => {
  it('exposes no update route for a review', async () => {
    const res = await request(app).patch('/api/reviews/review_1')
      .set('Authorization', `Bearer ${ALEX}`)
      .send({ overall_rating: 5 });

    expect(res.status).toBe(404); // no such route exists at all
  });

  it('exposes no delete route for a review', async () => {
    const res = await request(app).delete('/api/reviews/review_1')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(404);
  });

  it('exposes no update function on the review service', () => {
    expect(reviewService.updateReview).toBeUndefined();
    expect(reviewService.deleteReview).toBeUndefined();
  });
});

describe('GET /api/reviews/tutor/:tutorId', () => {
  it('returns hydrated reviews newest first without leaking password hashes', async () => {
    ddbMock.reset();
    setupMocks({
      tutorReviews: [
        { id: 'r_old', tutor_id: 'tutorprofile_alex', student_id: 'user_jinyu', module_id: 'module_it2513', overall_rating: 4, created_date: '2026-08-01T10:00:00.000Z', verified_session: true },
        { id: 'r_new', tutor_id: 'tutorprofile_alex', student_id: 'user_jinyu', module_id: 'module_it2513', overall_rating: 5, created_date: '2026-08-18T10:00:00.000Z', verified_session: true },
      ],
    });

    const res = await request(app).get('/api/reviews/tutor/tutorprofile_alex')
      .set('Authorization', `Bearer ${JINYU}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reviews.map((r) => r.id)).toEqual(['r_new', 'r_old']);
    expect(res.body.data.reviews[0].student.full_name).toBe('Jinyu Chen');
    expect(res.body.data.reviews[0].student.password_hash).toBeUndefined();
    expect(res.body.data.reviews[0].module.module_code).toBe('IT2513');
  });
});

describe('GET /api/reviews/me — tutor\'s own reviews', () => {
  it('returns per-dimension averages for the tutor', async () => {
    ddbMock.reset();
    setupMocks({
      tutorReviews: [
        { id: 'r1', tutor_id: 'tutorprofile_alex', student_id: 'user_jinyu', knowledge_rating: 5, clarity_rating: 4, helpfulness_rating: 5, preparation_rating: 4, communication_rating: 5, overall_rating: 5, created_date: '2026-08-18T10:00:00.000Z' },
        { id: 'r2', tutor_id: 'tutorprofile_alex', student_id: 'user_jinyu', knowledge_rating: 4, clarity_rating: 4, helpfulness_rating: 4, preparation_rating: 4, communication_rating: 4, overall_rating: 4, created_date: '2026-08-17T10:00:00.000Z' },
      ],
    });

    const res = await request(app).get('/api/reviews/me')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.averages.knowledge_rating).toBe(4.5);
    expect(res.body.data.averages.clarity_rating).toBe(4);
    expect(res.body.data.averages.overall_rating).toBe(4.5);
  });

  it('is not accessible to a student', async () => {
    const res = await request(app).get('/api/reviews/me')
      .set('Authorization', `Bearer ${JINYU}`);
    expect(res.status).toBe(403);
  });
});
