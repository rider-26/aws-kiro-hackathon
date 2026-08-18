const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { seedUsers, SEED_USERS } = require('../src/seed/seedUsers');

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe('seedUsers', () => {
  it('creates all seed users when none exist yet', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(PutCommand).resolves({});

    const result = await seedUsers();

    expect(Object.keys(result)).toHaveLength(SEED_USERS.length);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(SEED_USERS.length);
    expect(result['jinyu@student.demo'].role).toBe('Tutee');
    expect(result['alex@tutor.demo'].role).toBe('Tutor');
    expect(result['lecturer@admin.demo'].role).toBe('Admin');
  });

  it('does not recreate a user that already exists (idempotent)', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ id: 'existing_1', email: 'jinyu@student.demo', role: 'Tutee' }],
    });
    ddbMock.on(PutCommand).resolves({});

    const result = await seedUsers();

    // Every lookup in this test resolves to "already exists", so no Puts should happen at all.
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(result['jinyu@student.demo'].id).toBe('existing_1');
  });
});
