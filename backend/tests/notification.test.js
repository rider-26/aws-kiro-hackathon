const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');
const notificationService = require('../src/services/notificationService');

function tokenFor(id, role = 'Tutee') {
  return jwt.sign({ sub: id, role, email: `${id}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const JINYU_TOKEN = tokenFor('user_jinyu');

const NOTIFICATIONS = [
  { id: 'n1', user_id: 'user_jinyu', type: 'BookingAccepted', title: 'Booking confirmed', message: 'Accepted', read: false, created_date: '2026-08-18T10:00:00.000Z' },
  { id: 'n2', user_id: 'user_jinyu', type: 'NewMessage', title: 'New message', message: 'Hi', read: true, created_date: '2026-08-18T09:00:00.000Z' },
  { id: 'n3', user_id: 'user_jinyu', type: 'ReviewAvailable', title: 'Leave a review', message: 'Done', read: false, created_date: '2026-08-18T11:00:00.000Z' },
];

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.TableName === env.tables.notifications) {
      const uid = input.ExpressionAttributeValues[':uid'];
      return { Items: NOTIFICATIONS.filter((n) => n.user_id === uid) };
    }
    // Connections lookup during a real-time push — no live sockets in tests.
    return { Items: [] };
  });
  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(UpdateCommand).callsFake((input) => ({
    Attributes: { id: input.Key.id, read: true },
  }));
});

describe('GET /api/notifications', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('returns the user\'s notifications newest-first with an unread count', async () => {
    const res = await request(app).get('/api/notifications')
      .set('Authorization', `Bearer ${JINYU_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notifications.map((n) => n.id)).toEqual(['n3', 'n1', 'n2']);
    expect(res.body.data.unread).toBe(2);
  });
});

describe('GET /api/notifications/unread-count', () => {
  it('counts only unread notifications', async () => {
    const res = await request(app).get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${JINYU_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.unread).toBe(2);
  });
});

describe('PATCH /api/notifications/:id/read', () => {
  it('marks the user\'s own notification as read', async () => {
    ddbMock.on(GetCommand).resolves({ Item: NOTIFICATIONS[0] });

    const res = await request(app).patch('/api/notifications/n1/read')
      .set('Authorization', `Bearer ${JINYU_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notification.read).toBe(true);
  });

  it('refuses to mark another user\'s notification as read', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'n9', user_id: 'user_someone_else', read: false },
    });

    const res = await request(app).patch('/api/notifications/n9/read')
      .set('Authorization', `Bearer ${JINYU_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it('404s for a notification that does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: null });

    const res = await request(app).patch('/api/notifications/nope/read')
      .set('Authorization', `Bearer ${JINYU_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/notifications/read-all', () => {
  it('marks every unread notification as read and reports how many changed', async () => {
    const res = await request(app).post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${JINYU_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
  });
});

describe('notificationService.notify — resilience', () => {
  it('still persists the notification when the real-time push fails', async () => {
    // Force the connections lookup to blow up; the DB write must still succeed
    // because real-time delivery is explicitly best-effort.
    ddbMock.on(QueryCommand).callsFake((input) => {
      if (input.TableName === env.tables.connections) throw new Error('GSI missing');
      return { Items: [] };
    });

    const created = await notificationService.notify('user_jinyu', {
      type: 'BookingAccepted',
      title: 'Booking confirmed',
      message: 'Your session was accepted.',
    });

    expect(created.id).toMatch(/^notification_/);
    expect(created.read).toBe(false);
    expect(created.user_id).toBe('user_jinyu');
  });
});
