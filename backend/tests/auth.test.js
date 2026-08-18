const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');

const ddbMock = mockClient(DynamoDBDocumentClient);

// app must be required AFTER the mock is set up on the shared ddb client instance,
// but since ddb.js creates the client at module load, mocking the class itself
// (via mockClient) intercepts calls regardless of import order.
const app = require('../src/app');

beforeEach(() => {
  ddbMock.reset();
});

describe('POST /api/auth/register', () => {
  it('creates a new Tutee account and returns a token', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] }); // no existing user with this email
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Test Student',
      email: 'newstudent@student.demo',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe('Tutee');
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('always forces role=Tutee even if a different role is supplied', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Sneaky',
      email: 'sneaky@student.demo',
      password: 'password123',
      role: 'Admin',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('Tutee');
  });

  it('rejects registration with a duplicate email', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'user_1', email: 'dup@student.demo' }] });

    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Dup',
      email: 'dup@student.demo',
      password: 'password123',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects a short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Short',
      email: 'short@student.demo',
      password: '123',
    });
    expect(res.status).toBe(400);
  });

  // Email is the login identifier and must be unique, so a malformed value
  // creates an account nobody can be reached at. Note the browser's own
  // type="email" accepts a dotless domain like wyt@123, so the server cannot
  // rely on it.
  describe('email validation', () => {
    const INVALID = [
      ['a dotless domain', 'wyt@123'],
      ['no @ at all', 'wytstudent.demo'],
      ['nothing before the @', '@student.demo'],
      ['nothing after the @', 'wyt@'],
      ['a trailing dot', 'wyt@student.'],
      ['an embedded space', 'wyt user@student.demo'],
      ['only a domain dot', 'wyt@.demo'],
    ];

    it.each(INVALID)('rejects %s', async (_label, email) => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(PutCommand).resolves({});

      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Test',
        email,
        password: 'password123',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/valid email/i);
    });

    it('rejects an email over 254 characters', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Test',
        email: `${'a'.repeat(250)}@student.demo`,
        password: 'password123',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/too long/i);
    });

    it('does NOT restrict the domain, so seeded demo accounts stay valid', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(PutCommand).resolves({});

      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Demo Domain',
        email: 'someone@student.demo',
        password: 'password123',
      });
      expect(res.status).toBe(201);
    });

    it('accepts a multi-level institutional domain', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(PutCommand).resolves({});

      const res = await request(app).post('/api/auth/register').send({
        full_name: 'NYP Student',
        email: 'jinyu@student.nyp.edu.sg',
        password: 'password123',
      });
      expect(res.status).toBe(201);
    });

    it('normalises case and surrounding whitespace before storing', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(PutCommand).resolves({});

      const res = await request(app).post('/api/auth/register').send({
        full_name: '  Padded Name  ',
        email: '  MiXeD@Student.Demo  ',
        password: 'password123',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.user.email).toBe('mixed@student.demo');
      expect(res.body.data.user.full_name).toBe('Padded Name');
    });

    it('rejects a whitespace-only full name', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const res = await request(app).post('/api/auth/register').send({
        full_name: '   ',
        email: 'blank@student.demo',
        password: 'password123',
      });
      expect(res.status).toBe(400);
    });
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('correctpassword', 10);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        id: 'user_1',
        email: 'jinyu@student.demo',
        full_name: 'Jinyu Chen',
        role: 'Tutee',
        account_status: 'Active',
        password_hash: hash,
      }],
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'jinyu@student.demo',
      password: 'correctpassword',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe('jinyu@student.demo');
  });

  it('rejects an unknown email', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@student.demo',
      password: 'whatever123',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('correctpassword', 10);
    ddbMock.on(QueryCommand).resolves({
      Items: [{ id: 'user_1', email: 'jinyu@student.demo', role: 'Tutee', account_status: 'Active', password_hash: hash }],
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'jinyu@student.demo',
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  it('rejects login for a suspended account', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('correctpassword', 10);
    ddbMock.on(QueryCommand).resolves({
      Items: [{ id: 'user_1', email: 'suspended@student.demo', role: 'Tutee', account_status: 'Suspended', password_hash: hash }],
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'suspended@student.demo',
      password: 'correctpassword',
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/auth/me', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    // First log in to obtain a real token signed with the app's configured secret.
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('correctpassword', 10);
    const userRecord = {
      id: 'user_42', email: 'jinyu@student.demo', full_name: 'Jinyu Chen',
      role: 'Tutee', account_status: 'Active', password_hash: hash,
    };
    ddbMock.on(QueryCommand).resolves({ Items: [userRecord] });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'jinyu@student.demo',
      password: 'correctpassword',
    });
    const { token } = loginRes.body.data;

    ddbMock.on(GetCommand).resolves({ Item: userRecord });

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.id).toBe('user_42');
  });
});
