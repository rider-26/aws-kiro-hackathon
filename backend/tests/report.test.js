const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const reportService = require('../src/services/reportService');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(id, role) {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const JINYU = tokenFor('user_jinyu', 'Tutee');
const FARHAN = tokenFor('user_farhan', 'Tutee');
const ALEX = tokenFor('user_alex', 'Tutor');
const ADMIN = tokenFor('user_lim', 'Admin');

const USERS = {
  user_jinyu: { id: 'user_jinyu', full_name: 'Jinyu Chen', role: 'Tutee', account_status: 'Active', password_hash: 'secret' },
  user_farhan: { id: 'user_farhan', full_name: 'Farhan Rahman', role: 'Tutee', account_status: 'Active', password_hash: 'secret' },
  user_alex: { id: 'user_alex', full_name: 'Alex Tan', role: 'Tutor', account_status: 'Active', password_hash: 'secret' },
  user_marcus: { id: 'user_marcus', full_name: 'Marcus Wong', role: 'Tutor', account_status: 'Suspended', password_hash: 'secret' },
  user_lim: { id: 'user_lim', full_name: 'Ms Lim', role: 'Admin', account_status: 'Active', password_hash: 'secret' },
};

const SESSION = {
  id: 'session_1', module_id: 'module_it2513', tutor_id: 'tutorprofile_alex',
  session_date: '2026-08-14', start_time: '15:00', end_time: '16:00', status: 'Completed',
};

const IT2513 = { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' };

const PENDING_REPORT = {
  id: 'report_1', reporter_id: 'user_jinyu', reporter_role: 'Tutee', reported_user_id: 'user_alex',
  session_id: 'session_1', category: 'No Show', description: 'Tutor did not join the session.',
  status: 'Pending', action_taken: null, admin_notes: null, reviewed_by: null, reviewed_date: null,
  created_date: '2026-08-15T09:00:00.000Z',
};

const REVIEWING_REPORT = {
  ...PENDING_REPORT, id: 'report_2', status: 'Under Review', created_date: '2026-08-16T09:00:00.000Z',
};

const RESOLVED_REPORT = {
  ...PENDING_REPORT, id: 'report_3', status: 'Resolved', action_taken: 'Warning Issued',
  created_date: '2026-08-10T09:00:00.000Z',
};

const DISMISSED_REPORT = {
  ...PENDING_REPORT, id: 'report_4', status: 'Dismissed', action_taken: 'Dismissed — No Breach Found',
  reporter_id: 'user_farhan', created_date: '2026-08-09T09:00:00.000Z',
};

let writes = [];
let updates = [];

function setupMocks({ reports = [PENDING_REPORT], sessionExists = true } = {}) {
  writes = [];
  updates = [];

  ddbMock.reset();

  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.users) return { Item: USERS[input.Key.id] || null };
    if (input.TableName === env.tables.modules) return { Item: IT2513 };
    if (input.TableName === env.tables.sessions) return { Item: sessionExists ? SESSION : null };
    if (input.TableName === env.tables.userReports) {
      return { Item: reports.find((r) => r.id === input.Key.id) || null };
    }
    return { Item: null };
  });

  ddbMock.on(ScanCommand).callsFake((input) => {
    if (input.TableName === env.tables.userReports) return { Items: reports };
    return { Items: [] };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.userReports) {
      const rid = input.ExpressionAttributeValues[':rid'];
      const uid = input.ExpressionAttributeValues[':uid'];
      if (rid) return { Items: reports.filter((r) => r.reporter_id === rid) };
      if (uid) return { Items: reports.filter((r) => r.reported_user_id === uid) };
    }
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
      input.TableName === env.tables.userReports
        ? reports.find((r) => r.id === input.Key.id) || {}
        : USERS[input.Key.id] || {};

    return { Attributes: { ...source, id: input.Key.id, ...patch } };
  });
}

beforeEach(() => setupMocks());
afterAll(() => ddbMock.restore());

// ---------------------------------------------------------------------------
// Categories and statuses (spec sections 25 & 26)
// ---------------------------------------------------------------------------
describe('report taxonomy', () => {
  it('exposes exactly nine report categories', () => {
    expect(reportService.REPORT_CATEGORIES).toHaveLength(9);
    expect(new Set(reportService.REPORT_CATEGORIES).size).toBe(9);
  });

  it('exposes exactly four report statuses starting at Pending', () => {
    expect(reportService.REPORT_STATUSES).toEqual(['Pending', 'Under Review', 'Resolved', 'Dismissed']);
  });

  it('exposes exactly five admin actions', () => {
    expect(Object.keys(reportService.ADMIN_ACTIONS).sort()).toEqual(
      ['dismiss', 'request_info', 'resolve', 'suspend', 'warn']
    );
  });

  it('every admin action lands the report in a valid status', () => {
    for (const config of Object.values(reportService.ADMIN_ACTIONS)) {
      expect(reportService.REPORT_STATUSES).toContain(config.status);
      expect(typeof config.action_taken).toBe('string');
      expect(config.action_taken.length).toBeGreaterThan(0);
    }
  });

  it('only the suspend action can suspend an account', () => {
    const suspending = Object.entries(reportService.ADMIN_ACTIONS)
      .filter(([, c]) => c.suspends_account)
      .map(([k]) => k);
    expect(suspending).toEqual(['suspend']);
  });

  it('serves the category list to the report form', async () => {
    const res = await request(app).get('/api/reports/categories').set('Authorization', `Bearer ${JINYU}`);
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toHaveLength(9);
    expect(res.body.data.categories).toContain('No Show');
    expect(res.body.data.categories).toContain('Other');
  });
});

// ---------------------------------------------------------------------------
// Filing a report
// ---------------------------------------------------------------------------
describe('POST /api/reports', () => {
  it('lets a tutee file a report against a tutor, always as Pending', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ reported_user_id: 'user_alex', session_id: 'session_1', category: 'No Show', description: 'Did not show up.' });

    expect(res.status).toBe(201);
    expect(res.body.data.report.status).toBe('Pending');
    expect(res.body.data.report.reporter_id).toBe('user_jinyu');
    expect(res.body.data.report.reported_user_id).toBe('user_alex');
    expect(res.body.data.report.action_taken).toBeNull();
    expect(res.body.data.report.reviewed_by).toBeNull();

    const written = writes.find((w) => w.table === env.tables.userReports);
    expect(written.item.status).toBe('Pending');
  });

  it('lets a TUTOR file a report against a tutee (both parties can report)', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${ALEX}`)
      .send({ reported_user_id: 'user_jinyu', category: 'Inappropriate Behaviour', description: 'Rude in chat.' });

    expect(res.status).toBe(201);
    expect(res.body.data.report.reporter_role).toBe('Tutor');
  });

  it('accepts a report with no session reference', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ reported_user_id: 'user_alex', category: 'Spam or Scam', description: 'Unsolicited messages.' });

    expect(res.status).toBe(201);
    expect(res.body.data.report.session_id).toBeNull();
  });

  it('rejects a category outside the nine', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ reported_user_id: 'user_alex', category: 'Made Up Category', description: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/category must be one of/i);
  });

  it('rejects a missing description', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ reported_user_id: 'user_alex', category: 'No Show', description: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/description is required/i);
  });

  it('rejects a description over 2000 characters', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ reported_user_id: 'user_alex', category: 'No Show', description: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/2000 characters/i);
  });

  it('rejects a missing reported_user_id', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ category: 'No Show', description: 'Something happened.' });

    expect(res.status).toBe(400);
  });

  it('refuses self-reporting', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ reported_user_id: 'user_jinyu', category: 'Other', description: 'Testing.' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/your own account/i);
  });

  it('refuses reporting an administrator', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ reported_user_id: 'user_lim', category: 'Other', description: 'Testing.' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/administrator/i);
  });

  it('404s when the reported user does not exist', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ reported_user_id: 'user_ghost', category: 'Other', description: 'Testing.' });

    expect(res.status).toBe(404);
  });

  it('404s when the referenced session does not exist', async () => {
    setupMocks({ sessionExists: false });
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ reported_user_id: 'user_alex', session_id: 'session_ghost', category: 'No Show', description: 'x' });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/session not found/i);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/reports').send({ reported_user_id: 'user_alex' });
    expect(res.status).toBe(401);
  });

  it('does not let an admin file a report through the user form', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ reported_user_id: 'user_alex', category: 'Other', description: 'x' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Reporter's own list
// ---------------------------------------------------------------------------
describe('GET /api/reports/me', () => {
  it('returns only the reports the caller filed', async () => {
    setupMocks({ reports: [PENDING_REPORT, DISMISSED_REPORT] });

    const res = await request(app).get('/api/reports/me').set('Authorization', `Bearer ${JINYU}`);
    expect(res.status).toBe(200);
    expect(res.body.data.reports).toHaveLength(1);
    expect(res.body.data.reports[0].id).toBe('report_1');
  });

  it('hides admin notes and the admin identity from the reporter', async () => {
    const withNotes = { ...PENDING_REPORT, admin_notes: 'Internal: checking tutor logs', reviewed_by: 'user_lim' };
    setupMocks({ reports: [withNotes] });

    const res = await request(app).get('/api/reports/me').set('Authorization', `Bearer ${JINYU}`);
    expect(res.status).toBe(200);
    const report = res.body.data.reports[0];
    expect(report.admin_notes).toBeUndefined();
    expect(report.reviewed_by).toBeUndefined();
    expect(report.status).toBe('Pending');
  });

  it('hydrates the reported user and session module without leaking password_hash', async () => {
    const res = await request(app).get('/api/reports/me').set('Authorization', `Bearer ${JINYU}`);
    const report = res.body.data.reports[0];
    expect(report.reported_user.full_name).toBe('Alex Tan');
    expect(report.reported_user.password_hash).toBeUndefined();
    expect(report.session.module.module_code).toBe('IT2513');
  });

  it('returns an empty list for a user who filed nothing', async () => {
    const res = await request(app).get('/api/reports/me').set('Authorization', `Bearer ${FARHAN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.reports).toEqual([]);
  });

  it('exposes no edit or withdraw path for a filed report', async () => {
    const patched = await request(app)
      .patch('/api/reports/report_1')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ status: 'Dismissed' });
    const deleted = await request(app).delete('/api/reports/report_1').set('Authorization', `Bearer ${JINYU}`);

    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Admin queue
// ---------------------------------------------------------------------------
describe('GET /api/admin/reports', () => {
  it('orders Pending first, then Under Review, then closed reports', async () => {
    setupMocks({ reports: [RESOLVED_REPORT, DISMISSED_REPORT, PENDING_REPORT, REVIEWING_REPORT] });

    const res = await request(app).get('/api/admin/reports').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.reports.map((r) => r.status)).toEqual([
      'Pending', 'Under Review', 'Resolved', 'Dismissed',
    ]);
  });

  it('returns counts for each of the four statuses', async () => {
    setupMocks({ reports: [RESOLVED_REPORT, DISMISSED_REPORT, PENDING_REPORT, REVIEWING_REPORT] });

    const res = await request(app).get('/api/admin/reports').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.counts).toEqual({
      total: 4, pending: 1, under_review: 1, resolved: 1, dismissed: 1,
    });
  });

  it('filters by status', async () => {
    setupMocks({ reports: [RESOLVED_REPORT, PENDING_REPORT] });

    const res = await request(app).get('/api/admin/reports?status=Pending').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.body.data.reports).toHaveLength(1);
    expect(res.body.data.reports[0].status).toBe('Pending');
  });

  it('includes admin-only fields and the reporter identity', async () => {
    const withNotes = { ...PENDING_REPORT, admin_notes: 'Internal note' };
    setupMocks({ reports: [withNotes] });

    const res = await request(app).get('/api/admin/reports').set('Authorization', `Bearer ${ADMIN}`);
    const report = res.body.data.reports[0];
    expect(report.reporter.full_name).toBe('Jinyu Chen');
    expect(report.reporter.password_hash).toBeUndefined();
    expect(report.admin_notes).toBe('Internal note');
    expect(report.reported_user_status).toBe('Active');
  });

  it('refuses a tutee', async () => {
    const res = await request(app).get('/api/admin/reports').set('Authorization', `Bearer ${JINYU}`);
    expect(res.status).toBe(403);
  });

  it('refuses a tutor', async () => {
    const res = await request(app).get('/api/admin/reports').set('Authorization', `Bearer ${ALEX}`);
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/admin/reports');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/reports/:id', () => {
  it('includes prior reports against the same user for context', async () => {
    setupMocks({ reports: [PENDING_REPORT, RESOLVED_REPORT, DISMISSED_REPORT] });

    const res = await request(app).get('/api/admin/reports/report_1').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.report.prior_report_count).toBe(2);
    expect(res.body.data.report.prior_reports.map((r) => r.id)).not.toContain('report_1');
  });

  it('404s for an unknown report', async () => {
    const res = await request(app).get('/api/admin/reports/report_ghost').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Moderation actions
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/reports/:id/action', () => {
  it('warn resolves the report and records the outcome', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'warn', admin_notes: 'First offence.' });

    expect(res.status).toBe(200);
    expect(res.body.data.report.status).toBe('Resolved');
    expect(res.body.data.report.action_taken).toBe('Warning Issued');
    expect(res.body.data.report.reviewed_by).toBe('user_lim');
    expect(res.body.data.report.reviewed_date).toBeTruthy();
    expect(res.body.data.suspended_user).toBeNull();
  });

  it('warn does NOT change the reported account status', async () => {
    await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'warn' });

    const userUpdates = updates.filter((u) => u.table === env.tables.users);
    expect(userUpdates).toHaveLength(0);
  });

  it('suspend writes account_status Suspended on the reported user', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'suspend', admin_notes: 'Repeated no-shows.' });

    expect(res.status).toBe(200);
    expect(res.body.data.report.status).toBe('Resolved');
    expect(res.body.data.report.action_taken).toBe('Account Suspended');

    const userUpdate = updates.find((u) => u.table === env.tables.users && u.id === 'user_alex');
    expect(userUpdate.patch.account_status).toBe('Suspended');
    expect(userUpdate.patch.suspended_date).toBeTruthy();
    expect(userUpdate.patch.suspended_reason).toMatch(/report_1/);
  });

  it('suspend never returns the suspended user password hash', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'suspend' });

    expect(res.body.data.suspended_user.account_status).toBe('Suspended');
    expect(res.body.data.suspended_user.password_hash).toBeUndefined();
  });

  it('request_info moves the report to Under Review, leaving it open', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'request_info', admin_notes: 'Which session was this?' });

    expect(res.status).toBe(200);
    expect(res.body.data.report.status).toBe('Under Review');
    expect(res.body.data.report.action_taken).toBe('More Information Requested');
  });

  it('an Under Review report can still be actioned', async () => {
    setupMocks({ reports: [REVIEWING_REPORT] });

    const res = await request(app)
      .patch('/api/admin/reports/report_2/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'resolve' });

    expect(res.status).toBe(200);
    expect(res.body.data.report.status).toBe('Resolved');
  });

  it('dismiss closes the report as Dismissed', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'dismiss' });

    expect(res.status).toBe(200);
    expect(res.body.data.report.status).toBe('Dismissed');
    expect(res.body.data.report.action_taken).toMatch(/No Breach Found/);
  });

  it('resolve closes the report with no further action', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'resolve' });

    expect(res.status).toBe(200);
    expect(res.body.data.report.status).toBe('Resolved');
    expect(res.body.data.report.action_taken).toMatch(/No Further Action/);
  });

  it('refuses to re-action an already Resolved report', async () => {
    setupMocks({ reports: [RESOLVED_REPORT] });

    const res = await request(app)
      .patch('/api/admin/reports/report_3/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'suspend' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already Resolved/i);
  });

  it('refuses to re-action an already Dismissed report', async () => {
    setupMocks({ reports: [DISMISSED_REPORT] });

    const res = await request(app)
      .patch('/api/admin/reports/report_4/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'warn' });

    expect(res.status).toBe(409);
  });

  it('rejects an unknown action', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'delete_account' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/action must be one of/i);
  });

  it('404s for an unknown report', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_ghost/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'warn' });

    expect(res.status).toBe(404);
  });

  it('refuses suspending an administrator', async () => {
    setupMocks({ reports: [{ ...PENDING_REPORT, reported_user_id: 'user_lim' }] });

    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'suspend' });

    expect(res.status).toBe(400);
    const userUpdate = updates.find((u) => u.table === env.tables.users);
    expect(userUpdate).toBeUndefined();
  });

  it('a tutee cannot action a report', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${JINYU}`)
      .send({ action: 'dismiss' });

    expect(res.status).toBe(403);
  });

  it('a tutor cannot action a report', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ALEX}`)
      .send({ action: 'suspend' });

    expect(res.status).toBe(403);
    expect(updates.filter((u) => u.table === env.tables.users)).toHaveLength(0);
  });

  it('notifies the reported user on a warning', async () => {
    await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'warn' });

    const notifications = writes.filter((w) => w.table === env.tables.notifications);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].item.user_id).toBe('user_alex');
    expect(notifications[0].item.type).toBe('ReportUpdated');
  });

  it('notifies the reporter on a dismissal', async () => {
    await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'dismiss' });

    const notifications = writes.filter((w) => w.table === env.tables.notifications);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].item.user_id).toBe('user_jinyu');
  });

  it('rejects admin_notes over 2000 characters', async () => {
    const res = await request(app)
      .patch('/api/admin/reports/report_1/action')
      .set('Authorization', `Bearer ${ADMIN}`)
      .send({ action: 'warn', admin_notes: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Reinstatement
// ---------------------------------------------------------------------------
describe('POST /api/admin/users/:userId/reinstate', () => {
  it('lifts a suspension and clears the suspension fields', async () => {
    const res = await request(app)
      .post('/api/admin/users/user_marcus/reinstate')
      .set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.account_status).toBe('Active');
    expect(res.body.data.user.suspended_date).toBeNull();
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('409s when the account is not suspended', async () => {
    const res = await request(app)
      .post('/api/admin/users/user_alex/reinstate')
      .set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not suspended/i);
  });

  it('404s for an unknown user', async () => {
    const res = await request(app)
      .post('/api/admin/users/user_ghost/reinstate')
      .set('Authorization', `Bearer ${ADMIN}`);

    expect(res.status).toBe(404);
  });

  it('refuses a non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/users/user_marcus/reinstate')
      .set('Authorization', `Bearer ${ALEX}`);

    expect(res.status).toBe(403);
  });
});
