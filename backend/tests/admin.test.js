const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(id, role) {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const ADMIN = tokenFor('user_lim', 'Admin');
const ALEX = tokenFor('user_alex', 'Tutor');
const JINYU = tokenFor('user_jinyu', 'Tutee');

const USERS = [
  { id: 'user_jinyu', full_name: 'Jinyu Chen', email: 'jinyu@student.demo', role: 'Tutee', course: 'IT', account_status: 'Active', share_learning_summary: true, password_hash: 'secret' },
  { id: 'user_farhan', full_name: 'Farhan Rahman', email: 'farhan@student.demo', role: 'Tutee', course: 'IT', account_status: 'Active', password_hash: 'secret' },
  { id: 'user_alex', full_name: 'Alex Tan', email: 'alex@tutor.demo', role: 'Tutor', course: 'Cybersecurity', account_status: 'Active', password_hash: 'secret' },
  { id: 'user_daniel', full_name: 'Daniel Koh', email: 'daniel@tutor.demo', role: 'Tutor', course: 'Networking', account_status: 'Suspended', password_hash: 'secret' },
  { id: 'user_nora', full_name: 'Nora Sim', email: 'nora@tutor.demo', role: 'Tutor', course: 'IT', account_status: 'Active', password_hash: 'secret' }, // no profile row
  { id: 'user_lim', full_name: 'Ms Lim', email: 'lecturer@admin.demo', role: 'Admin', account_status: 'Active', password_hash: 'secret' },
];

const MODULES = [
  { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' },
  { id: 'module_it1913', module_code: 'IT1913', module_name: 'Database Systems' },
];

const PROFILES = [
  { id: 'tutorprofile_alex', user_id: 'user_alex', average_rating: 4.8, completed_sessions: 24, students_helped: 41, bio: 'Bio', teaching_style: 'Worked examples', total_tutoring_minutes: 1440 },
  { id: 'tutorprofile_daniel', user_id: 'user_daniel', average_rating: 0, completed_sessions: 0, students_helped: 0 },
];

const VERIFICATIONS = [
  { id: 'ver_alex_2513', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', status: 'Verified', created_date: '2026-07-01T00:00:00.000Z', admin_notes: '' },
  { id: 'ver_daniel_2513', tutor_id: 'tutorprofile_daniel', module_id: 'module_it2513', status: 'Pending', created_date: '2026-08-10T00:00:00.000Z', admin_notes: '' },
  { id: 'ver_daniel_1913', tutor_id: 'tutorprofile_daniel', module_id: 'module_it1913', status: 'Rejected', created_date: '2026-07-15T00:00:00.000Z', admin_notes: 'Insufficient evidence' },
];

const SESSIONS = [
  {
    id: 'session_done', booking_id: 'booking_1', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513',
    title: 'IT2513 Signatures', date: '2026-08-14', start_time: '15:00', end_time: '16:00',
    session_mode: 'Online', location: 'Online (in-app)', status: 'Completed',
    duration_minutes: 60, attendance_verified: true, maximum_students: 1,
  },
  {
    id: 'session_group', booking_id: null, tutor_id: 'tutorprofile_alex', module_id: 'module_it2513',
    title: 'Crypto Revision', date: '2026-08-23', start_time: '15:00', end_time: '16:30',
    session_mode: 'Online', location: 'Online (in-app)', status: 'Upcoming',
    duration_minutes: null, attendance_verified: false, maximum_students: 5,
  },
  {
    id: 'session_cancelled', booking_id: 'booking_2', tutor_id: 'tutorprofile_alex', module_id: 'module_it1913',
    title: 'SQL Joins', date: '2026-08-05', start_time: '10:00', end_time: '11:00',
    session_mode: 'Physical', location: 'Library', status: 'Cancelled',
    duration_minutes: null, attendance_verified: false, maximum_students: 1,
  },
];

const PARTICIPANTS = [
  { id: 'p1', session_id: 'session_done', student_id: 'user_jinyu', attendance_status: 'Attended', check_in_time: '2026-08-14T15:02:00.000Z', completion_confirmed: true },
  { id: 'p2', session_id: 'session_group', student_id: 'user_farhan', attendance_status: 'Registered', check_in_time: null, completion_confirmed: false },
];

const BOOKINGS = [
  { id: 'booking_1', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', status: 'Completed' },
  { id: 'booking_2', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', module_id: 'module_it1913', status: 'Cancelled' },
  { id: 'booking_3', student_id: 'user_farhan', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', status: 'Pending' },
  { id: 'booking_4', student_id: 'user_farhan', tutor_id: 'tutorprofile_daniel', module_id: 'module_it2513', status: 'Declined', decline_reason: 'Schedule conflict' },
  { id: 'booking_5', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', status: 'Accepted' },
];

const REVIEWS = [
  { id: 'review_1', session_id: 'session_done', student_id: 'user_jinyu', tutor_id: 'tutorprofile_alex', overall_rating: 5, verified_session: true },
  { id: 'review_2', session_id: 'session_done', student_id: 'user_farhan', tutor_id: 'tutorprofile_alex', overall_rating: 4, verified_session: true },
];

const REPORTS = [
  { id: 'report_1', reporter_id: 'user_jinyu', reported_user_id: 'user_daniel', category: 'No Show', status: 'Pending', created_date: '2026-08-16T00:00:00.000Z' },
  { id: 'report_2', reporter_id: 'user_farhan', reported_user_id: 'user_daniel', category: 'No Show', status: 'Resolved', created_date: '2026-08-01T00:00:00.000Z' },
];

const ATTEMPTS = [
  { id: 'attempt_1', student_id: 'user_jinyu', quiz_id: 'quiz_1', module_id: 'module_it2513', status: 'Completed', score: 7, total_questions: 10, percentage: 70, completed_date: '2026-08-11T10:00:00.000Z' },
  { id: 'attempt_2', student_id: 'user_jinyu', quiz_id: 'quiz_1', module_id: 'module_it2513', status: 'Completed', score: 9, total_questions: 10, percentage: 90, completed_date: '2026-08-18T10:00:00.000Z' },
  { id: 'attempt_3', student_id: 'user_farhan', quiz_id: 'quiz_1', module_id: 'module_it2513', status: 'Completed', score: 5, total_questions: 10, percentage: 50, completed_date: '2026-08-12T10:00:00.000Z' },
  { id: 'attempt_4', student_id: 'user_farhan', quiz_id: 'quiz_1', module_id: 'module_it2513', status: 'In Progress' },
];

const TOPIC_PERF = [
  { id: 'tp1', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Certificates', score_percentage: 40, status: 'Needs Improvement' },
  { id: 'tp2', student_id: 'user_farhan', module_id: 'module_it2513', topic: 'Certificates', score_percentage: 20, status: 'Needs Improvement' },
  { id: 'tp3', student_id: 'user_jinyu', module_id: 'module_it2513', topic: 'Hashing', score_percentage: 100, status: 'Strong' },
];

let writes = [];
let updates = [];

function setupMocks({ verifications = VERIFICATIONS, recognitionRules = null } = {}) {
  writes = [];
  updates = [];
  ddbMock.reset();

  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.users) {
      return { Item: USERS.find((u) => u.id === input.Key.id) || null };
    }
    if (input.TableName === env.tables.modules) {
      return { Item: MODULES.find((m) => m.id === input.Key.id) || null };
    }
    if (input.TableName === env.tables.tutorProfiles) {
      return { Item: PROFILES.find((p) => p.id === input.Key.id) || null };
    }
    if (input.TableName === env.tables.tutorVerifications) {
      return { Item: verifications.find((v) => v.id === input.Key.id) || null };
    }
    if (input.TableName === env.tables.sessions) {
      return { Item: SESSIONS.find((s) => s.id === input.Key.id) || null };
    }
    if (input.TableName === env.tables.recognitionRules) {
      return { Item: recognitionRules };
    }
    return { Item: null };
  });

  ddbMock.on(ScanCommand).callsFake((input) => {
    const byTable = {
      [env.tables.users]: USERS,
      [env.tables.modules]: MODULES,
      [env.tables.tutorProfiles]: PROFILES,
      [env.tables.tutorVerifications]: verifications,
      [env.tables.sessions]: SESSIONS,
      [env.tables.sessionParticipants]: PARTICIPANTS,
      [env.tables.bookings]: BOOKINGS,
      [env.tables.reviews]: REVIEWS,
      [env.tables.userReports]: REPORTS,
      [env.tables.quizAttempts]: ATTEMPTS,
      [env.tables.topicPerformance]: TOPIC_PERF,
    };
    return { Items: byTable[input.TableName] || [] };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    const v = input.ExpressionAttributeValues || {};

    if (input.TableName === env.tables.tutorProfiles && input.IndexName === 'userId-index') {
      return { Items: PROFILES.filter((p) => p.user_id === v[':uid']) };
    }
    if (input.TableName === env.tables.tutorVerifications) {
      if (v[':tid']) return { Items: verifications.filter((x) => x.tutor_id === v[':tid']) };
      if (v[':mid']) return { Items: verifications.filter((x) => x.module_id === v[':mid']) };
    }
    if (input.TableName === env.tables.sessions && v[':tid']) {
      return { Items: SESSIONS.filter((s) => s.tutor_id === v[':tid']) };
    }
    if (input.TableName === env.tables.sessionParticipants) {
      // listBySession binds :sid, listByStudent binds :stid.
      if (v[':sid']) return { Items: PARTICIPANTS.filter((p) => p.session_id === v[':sid']) };
      if (v[':stid']) return { Items: PARTICIPANTS.filter((p) => p.student_id === v[':stid']) };
    }
    if (input.TableName === env.tables.bookings) {
      if (v[':sid']) return { Items: BOOKINGS.filter((b) => b.student_id === v[':sid']) };
      if (v[':tid']) return { Items: BOOKINGS.filter((b) => b.tutor_id === v[':tid']) };
    }
    if (input.TableName === env.tables.reviews && v[':tid']) {
      return { Items: REVIEWS.filter((r) => r.tutor_id === v[':tid']) };
    }
    if (input.TableName === env.tables.userReports) {
      if (v[':uid']) return { Items: REPORTS.filter((r) => r.reported_user_id === v[':uid']) };
      if (v[':rid']) return { Items: REPORTS.filter((r) => r.reporter_id === v[':rid']) };
    }
    if (input.TableName === env.tables.quizAttempts && v[':sid']) {
      return { Items: ATTEMPTS.filter((a) => a.student_id === v[':sid']) };
    }
    if (input.TableName === env.tables.tutorTopics && v[':tid']) return { Items: [] };
    return { Items: [] };
  });

  ddbMock.on(PutCommand).callsFake((input) => {
    writes.push({ table: input.TableName, item: input.Item });
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
    updates.push({ table: input.TableName, id: input.Key.id, patch });

    const source =
      input.TableName === env.tables.tutorVerifications
        ? verifications.find((x) => x.id === input.Key.id) || {}
        : {};
    return { Attributes: { ...source, id: input.Key.id, ...patch } };
  });
}

beforeEach(() => setupMocks());
afterAll(() => ddbMock.restore());

// ---------------------------------------------------------------------------
// Access control — every admin route refuses non-admins
// ---------------------------------------------------------------------------
describe('admin route access control', () => {
  const ROUTES = [
    '/api/admin/dashboard',
    '/api/admin/verifications',
    '/api/admin/students',
    '/api/admin/tutors',
    '/api/admin/sessions',
    '/api/admin/analytics',
    '/api/admin/reports',
  ];

  it.each(ROUTES)('%s requires authentication', async (route) => {
    const res = await request(app).get(route);
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)('%s refuses a tutor', async (route) => {
    const res = await request(app).get(route).set('Authorization', `Bearer ${ALEX}`);
    expect(res.status).toBe(403);
  });

  it.each(ROUTES)('%s refuses a tutee', async (route) => {
    const res = await request(app).get(route).set('Authorization', `Bearer ${JINYU}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Verification workflow (business rule 12)
// ---------------------------------------------------------------------------
describe('GET /api/admin/verifications', () => {
  it('orders Pending first, then Verified, Rejected, Revoked', async () => {
    const res = await request(app).get('/api/admin/verifications').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.verifications.map((v) => v.status)).toEqual(['Pending', 'Verified', 'Rejected']);
  });

  it('returns per-status counts', async () => {
    const res = await request(app).get('/api/admin/verifications').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.counts).toEqual({ total: 3, pending: 1, verified: 1, rejected: 1, revoked: 0 });
  });

  it('hydrates the tutor and module so the queue is not opaque ids', async () => {
    const res = await request(app).get('/api/admin/verifications').set('Authorization', `Bearer ${ADMIN}`);
    const pending = res.body.data.verifications[0];
    expect(pending.tutor.user.full_name).toBe('Daniel Koh');
    expect(pending.tutor.user.password_hash).toBeUndefined();
    expect(pending.module.module_code).toBe('IT2513');
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/admin/verifications?status=Verified')
      .set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.verifications).toHaveLength(1);
    expect(res.body.data.verifications[0].id).toBe('ver_alex_2513');
  });

  it('exposes the four valid statuses', async () => {
    const res = await request(app).get('/api/admin/verifications').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.statuses).toEqual(['Pending', 'Verified', 'Rejected', 'Revoked']);
  });
});

describe('PATCH /api/admin/verifications/:id', () => {
  it('approves a Pending request and stamps the deciding admin', async () => {
    const res = await request(app)
      .patch('/api/admin/verifications/ver_daniel_2513')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ status: 'Verified', admin_notes: 'Transcript checked.' });

    expect(res.status).toBe(200);
    expect(res.body.data.verification.status).toBe('Verified');
    expect(res.body.data.verification.verified_by).toBe('user_lim');
    expect(res.body.data.verification.verified_date).toBeTruthy();
    expect(res.body.data.verification.admin_notes).toBe('Transcript checked.');
  });

  it('notifies the tutor when approved', async () => {
    await request(app)
      .patch('/api/admin/verifications/ver_daniel_2513')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ status: 'Verified' });

    const notes = writes.filter((w) => w.table === env.tables.notifications);
    expect(notes).toHaveLength(1);
    expect(notes[0].item.user_id).toBe('user_daniel');
    expect(notes[0].item.type).toBe('TutorVerified');
    expect(notes[0].item.title).toMatch(/IT2513/);
  });

  it('rejects a Pending request and notifies the tutor', async () => {
    const res = await request(app)
      .patch('/api/admin/verifications/ver_daniel_2513')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ status: 'Rejected', admin_notes: 'Need module transcript.' });

    expect(res.status).toBe(200);
    expect(res.body.data.verification.status).toBe('Rejected');
    const notes = writes.filter((w) => w.table === env.tables.notifications);
    expect(notes[0].item.title).toMatch(/not approved/i);
  });

  it('revokes a Verified module and warns the tutor they lose visibility', async () => {
    const res = await request(app)
      .patch('/api/admin/verifications/ver_alex_2513')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ status: 'Revoked', admin_notes: 'Conduct review.' });

    expect(res.status).toBe(200);
    expect(res.body.data.verification.status).toBe('Revoked');
    const notes = writes.filter((w) => w.table === env.tables.notifications);
    expect(notes[0].item.user_id).toBe('user_alex');
    expect(notes[0].item.message).toMatch(/no longer appear in search results/i);
  });

  it('refuses to revoke something that was never Verified', async () => {
    const res = await request(app)
      .patch('/api/admin/verifications/ver_daniel_2513')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ status: 'Revoked' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/only a verified module can be revoked/i);
  });

  it('refuses a no-op transition to the current status', async () => {
    const res = await request(app)
      .patch('/api/admin/verifications/ver_alex_2513')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ status: 'Verified' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already Verified/i);
  });

  it('rejects an invalid status', async () => {
    const res = await request(app)
      .patch('/api/admin/verifications/ver_daniel_2513')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ status: 'SuperVerified' });

    expect(res.status).toBe(400);
  });

  it('404s for an unknown verification', async () => {
    const res = await request(app)
      .patch('/api/admin/verifications/ver_ghost')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ status: 'Verified' });

    expect(res.status).toBe(404);
  });

  it('refuses a tutor trying to verify themselves through the admin route', async () => {
    const res = await request(app)
      .patch('/api/admin/verifications/ver_daniel_2513')
      .set('Authorization', `Bearer ${ALEX}`)
      .send({ status: 'Verified' });

    expect(res.status).toBe(403);
    expect(updates.filter((u) => u.table === env.tables.tutorVerifications)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dashboard (spec section 23)
// ---------------------------------------------------------------------------
describe('GET /api/admin/dashboard', () => {
  it('counts students, tutors and suspended accounts', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stats.total_students).toBe(2);
    expect(res.body.data.stats.total_tutors).toBe(3);
    expect(res.body.data.stats.suspended_accounts).toBe(1);
  });

  it('counts verifications and the pending queue', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.stats.verified_tutor_modules).toBe(1);
    expect(res.body.data.stats.pending_verifications).toBe(1);
  });

  it('counts sessions and derives tutoring hours from measured durations', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.stats.total_sessions).toBe(3);
    expect(res.body.data.stats.completed_sessions).toBe(1);
    expect(res.body.data.stats.upcoming_sessions).toBe(1);
    expect(res.body.data.stats.tutoring_hours).toBe(1);
  });

  it('counts open reports', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.stats.pending_reports).toBe(1);
  });

  it('surfaces the two action queues with names attached', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.action_required.verifications).toHaveLength(1);
    expect(res.body.data.action_required.verifications[0].tutor.user.full_name).toBe('Daniel Koh');
    expect(res.body.data.action_required.reports).toHaveLength(1);
    expect(res.body.data.action_required.reports[0].reported_user.full_name).toBe('Daniel Koh');
    expect(res.body.data.action_required.reports[0].reported_user.password_hash).toBeUndefined();
  });

  it('averages tutor ratings across only rated profiles', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${ADMIN}`);
    // Only Alex has a rating (4.8); Daniel's 0 must not drag the average to 2.4.
    expect(res.body.data.stats.platform_average_rating).toBe(4.8);
  });
});

// ---------------------------------------------------------------------------
// Students roster (spec section 24)
// ---------------------------------------------------------------------------
describe('GET /api/admin/students', () => {
  it('returns only Tutee accounts', async () => {
    const res = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(2);
    expect(res.body.data.students.every((s) => s.role === 'Tutee')).toBe(true);
  });

  it('reports engagement counts and the latest score, not raw answers', async () => {
    const res = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${ADMIN}`);
    const jinyu = res.body.data.students.find((s) => s.id === 'user_jinyu');
    expect(jinyu.quiz_attempt_count).toBe(2);
    expect(jinyu.latest_quiz_percentage).toBe(90);
    expect(jinyu.booking_count).toBe(3);
    expect(jinyu.sessions_attended).toBe(1);
    // Private learning detail must not appear on an admin roster.
    expect(jinyu.responses).toBeUndefined();
    expect(jinyu.answers).toBeUndefined();
    expect(jinyu.password_hash).toBeUndefined();
  });

  it('excludes In Progress attempts from the count', async () => {
    const res = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${ADMIN}`);
    const farhan = res.body.data.students.find((s) => s.id === 'user_farhan');
    expect(farhan.quiz_attempt_count).toBe(1);
    expect(farhan.latest_quiz_percentage).toBe(50);
  });

  it('shows the learning-summary sharing flag', async () => {
    const res = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${ADMIN}`);
    const jinyu = res.body.data.students.find((s) => s.id === 'user_jinyu');
    const farhan = res.body.data.students.find((s) => s.id === 'user_farhan');
    expect(jinyu.shares_learning_summary).toBe(true);
    expect(farhan.shares_learning_summary).toBe(false);
  });

  it('filters by search term', async () => {
    const res = await request(app).get('/api/admin/students?search=farhan').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.students).toHaveLength(1);
    expect(res.body.data.students[0].full_name).toBe('Farhan Rahman');
  });

  it('sorts alphabetically by name', async () => {
    const res = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.students.map((s) => s.full_name)).toEqual(['Farhan Rahman', 'Jinyu Chen']);
  });
});

// ---------------------------------------------------------------------------
// Tutors roster (spec section 24)
// ---------------------------------------------------------------------------
describe('GET /api/admin/tutors', () => {
  it('returns only Tutor accounts', async () => {
    const res = await request(app).get('/api/admin/tutors').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tutors).toHaveLength(3);
    expect(res.body.data.tutors.every((t) => t.role === 'Tutor')).toBe(true);
  });

  it('reports verified module count and names', async () => {
    const res = await request(app).get('/api/admin/tutors').set('Authorization', `Bearer ${ADMIN}`);
    const alex = res.body.data.tutors.find((t) => t.id === 'user_alex');
    expect(alex.verified_module_count).toBe(1);
    expect(alex.verified_modules[0].module_code).toBe('IT2513');
    expect(alex.average_rating).toBe(4.8);
    expect(alex.review_count).toBe(2);
  });

  it('reports the pending verification count for the queue', async () => {
    const res = await request(app).get('/api/admin/tutors').set('Authorization', `Bearer ${ADMIN}`);
    const daniel = res.body.data.tutors.find((t) => t.id === 'user_daniel');
    expect(daniel.pending_verification_count).toBe(1);
    expect(daniel.verified_module_count).toBe(0);
  });

  it('surfaces a suspended tutor rather than hiding it', async () => {
    const res = await request(app).get('/api/admin/tutors').set('Authorization', `Bearer ${ADMIN}`);
    const daniel = res.body.data.tutors.find((t) => t.id === 'user_daniel');
    expect(daniel.account_status).toBe('Suspended');
  });

  it('surfaces a Tutor account with no profile row yet', async () => {
    const res = await request(app).get('/api/admin/tutors').set('Authorization', `Bearer ${ADMIN}`);
    const nora = res.body.data.tutors.find((t) => t.id === 'user_nora');
    expect(nora.has_profile).toBe(false);
    expect(nora.tutor_profile_id).toBeNull();
    expect(nora.verified_module_count).toBe(0);
  });

  it('never leaks a password hash', async () => {
    const res = await request(app).get('/api/admin/tutors').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.tutors.every((t) => t.password_hash === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Session records (spec section 24) — records, never chat
// ---------------------------------------------------------------------------
describe('GET /api/admin/sessions', () => {
  it('returns attendance and recognition state for each session', async () => {
    const res = await request(app).get('/api/admin/sessions').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    const done = res.body.data.sessions.find((s) => s.id === 'session_done');
    expect(done.participant_count).toBe(1);
    expect(done.checked_in_count).toBe(1);
    expect(done.duration_minutes).toBe(60);
    expect(done.attendance_verified).toBe(true);
    expect(done.recognition_status).toBe('Pending Lecturer Approval');
    expect(Array.isArray(done.recognition_criteria)).toBe(true);
  });

  it('never returns chat messages on a session record', async () => {
    const res = await request(app).get('/api/admin/sessions').set('Authorization', `Bearer ${ADMIN}`);
    for (const s of res.body.data.sessions) {
      expect(s.messages).toBeUndefined();
      expect(s.chat).toBeUndefined();
      expect(s.chat_messages).toBeUndefined();
    }
  });

  it('recognition status is never an award', async () => {
    const res = await request(app).get('/api/admin/sessions').set('Authorization', `Bearer ${ADMIN}`);
    for (const s of res.body.data.sessions) {
      expect(s.recognition_status).not.toMatch(/award|granted/i);
    }
  });

  it('flags group sessions', async () => {
    const res = await request(app).get('/api/admin/sessions').set('Authorization', `Bearer ${ADMIN}`);
    const group = res.body.data.sessions.find((s) => s.id === 'session_group');
    const oneToOne = res.body.data.sessions.find((s) => s.id === 'session_done');
    expect(group.is_group_session).toBe(true);
    expect(group.maximum_students).toBe(5);
    expect(oneToOne.is_group_session).toBe(false);
  });

  it('hydrates the module and tutor', async () => {
    const res = await request(app).get('/api/admin/sessions').set('Authorization', `Bearer ${ADMIN}`);
    const done = res.body.data.sessions.find((s) => s.id === 'session_done');
    expect(done.module.module_code).toBe('IT2513');
    expect(done.tutor.full_name).toBe('Alex Tan');
  });

  it('sorts newest session first', async () => {
    const res = await request(app).get('/api/admin/sessions').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.sessions.map((s) => s.id)).toEqual([
      'session_group', 'session_done', 'session_cancelled',
    ]);
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/admin/sessions?status=Completed')
      .set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0].id).toBe('session_done');
  });

  it('filters by module', async () => {
    const res = await request(app)
      .get('/api/admin/sessions?moduleId=module_it1913')
      .set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0].id).toBe('session_cancelled');
  });
});

// ---------------------------------------------------------------------------
// Analytics (spec section 27) — aggregate only
// ---------------------------------------------------------------------------
describe('GET /api/admin/analytics', () => {
  it('ranks module demand by booking volume with verified tutor supply', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    const top = res.body.data.module_demand[0];
    expect(top.module_code).toBe('IT2513');
    expect(top.booking_count).toBe(4);
    expect(top.verified_tutor_count).toBe(1);
  });

  it('computes the booking funnel and acceptance rate', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    const funnel = res.body.data.booking_funnel;
    expect(funnel.total).toBe(5);
    expect(funnel.pending).toBe(1);
    expect(funnel.accepted).toBe(1);
    expect(funnel.declined).toBe(1);
    expect(funnel.completed).toBe(1);
    // Accepted + Completed out of 5.
    expect(funnel.acceptance_rate).toBe(40);
  });

  it('groups decline reasons', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.booking_funnel.decline_reasons).toEqual([{ reason: 'Schedule conflict', count: 1 }]);
  });

  it('computes session completion rate and hours', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    const s = res.body.data.sessions;
    expect(s.total).toBe(3);
    expect(s.completed).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.group_sessions).toBe(1);
    expect(s.completion_rate).toBe(33);
    expect(s.total_hours).toBe(1);
    expect(s.average_duration_minutes).toBe(60);
  });

  it('averages quiz scores across completed attempts only', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    // (70 + 90 + 50) / 3 = 70
    expect(res.body.data.learning.total_attempts).toBe(3);
    expect(res.body.data.learning.average_score_percentage).toBe(70);
  });

  it('computes the retake rate as students with more than one attempt', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    const l = res.body.data.learning;
    expect(l.students_with_attempts).toBe(2);
    expect(l.students_with_retake).toBe(1);
    expect(l.retake_rate).toBe(50);
    expect(l.quiz_participation_rate).toBe(100);
  });

  it('averages topic gaps across students, weakest first', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    const gaps = res.body.data.learning.topic_gaps;
    // Certificates: (40 + 20) / 2 = 30, weaker than Hashing at 100.
    expect(gaps[0].topic).toBe('Certificates');
    expect(gaps[0].average_percentage).toBe(30);
    expect(gaps[0].student_count).toBe(2);
    expect(gaps[0].verified_tutor_count).toBe(1);
    expect(gaps[gaps.length - 1].topic).toBe('Hashing');
  });

  it('summarises review and report quality signals', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    const q = res.body.data.quality;
    expect(q.review_count).toBe(2);
    expect(q.average_rating).toBe(4.5);
    expect(q.report_count).toBe(2);
    expect(q.open_reports).toBe(1);
    expect(q.reports_by_category).toEqual([{ category: 'No Show', count: 2 }]);
  });

  it('states that no individual learning data was read', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.notice).toMatch(/no individual quiz answers/i);
  });

  it('returns no per-student rows anywhere in the payload', async () => {
    const res = await request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${ADMIN}`);
    const serialised = JSON.stringify(res.body.data);
    expect(serialised).not.toMatch(/user_jinyu/);
    expect(serialised).not.toMatch(/user_farhan/);
  });
});

// ---------------------------------------------------------------------------
// User detail
// ---------------------------------------------------------------------------
describe('GET /api/admin/users/:userId', () => {
  it('returns account status and report counts against the user', async () => {
    const res = await request(app).get('/api/admin/users/user_daniel').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.account_status).toBe('Suspended');
    expect(res.body.data.reports_against_count).toBe(2);
    expect(res.body.data.open_reports_against).toBe(1);
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('404s for an unknown user', async () => {
    const res = await request(app).get('/api/admin/users/user_ghost').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(404);
  });
});
