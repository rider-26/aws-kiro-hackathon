const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
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

describe('Business rule: tutors cannot verify themselves', () => {
  it('there is no tutor-accessible route to change verification status', async () => {
    // The only status-changing route lives under /api/admin/verifications, which
    // is entirely gated behind requireRole('Admin'). A Tutor JWT must be rejected.
    const res = await request(app)
      .patch('/api/admin/verifications/verification_1')
      .set('Authorization', `Bearer ${tokenFor('Tutor')}`)
      .send({ status: 'Verified' });

    expect(res.status).toBe(403);
  });

  it('a tutor can only create a Pending verification request for a module, not set it Verified', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] }); // no existing profile via listAll fallback (not used, but safe)
    ddbMock.on(QueryCommand).callsFake((input) => {
      if (input.IndexName === 'userId-index') return { Items: [{ id: 'tutorprofile_1', user_id: 'user_1' }] };
      if (input.IndexName === 'tutorId-index') return { Items: [] }; // no existing verification requests
      return { Items: [] };
    });
    ddbMock.on(GetCommand).resolves({ Item: { id: 'module_1', module_code: 'IT2513' } });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/api/tutors/me/verifications')
      .set('Authorization', `Bearer ${tokenFor('Tutor', 'user_1')}`)
      .send({ module_id: 'module_1', status: 'Verified' }); // even if they try to smuggle a status in

    expect(res.status).toBe(201);
    expect(res.body.data.verification.status).toBe('Pending'); // service ignores client-supplied status entirely
  });
});

describe('Admin verification decision', () => {
  it('allows an admin to approve a pending verification', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'verification_1', tutor_id: 'tutorprofile_1', module_id: 'module_1', status: 'Pending' },
    });
    ddbMock.on(require('@aws-sdk/lib-dynamodb').UpdateCommand).resolves({
      Attributes: { id: 'verification_1', status: 'Verified', verified_by: 'admin_1' },
    });

    const res = await request(app)
      .patch('/api/admin/verifications/verification_1')
      .set('Authorization', `Bearer ${tokenFor('Admin', 'admin_1')}`)
      .send({ status: 'Verified' });

    expect(res.status).toBe(200);
    expect(res.body.data.verification.status).toBe('Verified');
  });

  it('rejects an invalid status value', async () => {
    const res = await request(app)
      .patch('/api/admin/verifications/verification_1')
      .set('Authorization', `Bearer ${tokenFor('Admin', 'admin_1')}`)
      .send({ status: 'NotARealStatus' });

    expect(res.status).toBe(400);
  });
});
