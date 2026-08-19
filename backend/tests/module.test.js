const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(role, id = 'user_1') {
  return jwt.sign({ sub: id, role, email: `${role.toLowerCase()}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

beforeEach(() => {
  ddbMock.reset();
});

describe('GET /api/modules', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/modules');
    expect(res.status).toBe(401);
  });

  it('returns only active modules by default', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { id: 'module_1', module_code: 'IT2513', module_name: 'Information Security', active: true },
        { id: 'module_2', module_code: 'IT9999', module_name: 'Retired Module', active: false },
      ],
    });

    const res = await request(app).get('/api/modules').set('Authorization', `Bearer ${tokenFor('Tutee')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.modules).toHaveLength(1);
    expect(res.body.data.modules[0].module_code).toBe('IT2513');
  });
});

describe('POST /api/modules', () => {
  it('rejects non-admin users', async () => {
    const res = await request(app)
      .post('/api/modules')
      .set('Authorization', `Bearer ${tokenFor('Tutee')}`)
      .send({ module_code: 'IT9999', module_name: 'New module' });
    expect(res.status).toBe(403);
  });

  it('allows admin to create a module', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] }); // no duplicate module_code
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/api/modules')
      .set('Authorization', `Bearer ${tokenFor('Admin')}`)
      .send({ module_code: 'IT9999', module_name: 'New module', description: 'desc' });

    expect(res.status).toBe(201);
    expect(res.body.data.module.module_code).toBe('IT9999');
  });

  it('rejects a duplicate module_code', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'module_1', module_code: 'IT2513' }] });

    const res = await request(app)
      .post('/api/modules')
      .set('Authorization', `Bearer ${tokenFor('Admin')}`)
      .send({ module_code: 'IT2513', module_name: 'Dup' });

    expect(res.status).toBe(409);
  });
});
