const { mockClient } = require('aws-sdk-client-mock');
const {
  DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand,
} = require('@aws-sdk/lib-dynamodb');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const ddbMock = mockClient(DynamoDBDocumentClient);
const app = require('../src/app');

function tokenFor(role, id = 'user_1') {
  return jwt.sign({ sub: id, role, email: `${role.toLowerCase()}@test.demo` }, env.jwtSecret, { expiresIn: '1h' });
}

const IT2513 = { id: 'module_it2513', module_code: 'IT2513', module_name: 'Information Security' };
const IT1913 = { id: 'module_it1913', module_code: 'IT1913', module_name: 'Database Systems' };

// Two tutor profiles: Alex (verified for IT2513) and Daniel (only Pending for IT2513 — must NOT appear).
const ALEX_PROFILE = {
  id: 'tutorprofile_alex', user_id: 'user_alex', bio: 'Alex bio', average_rating: 4.8,
  maximum_group_size: 5, physical_enabled: true, online_enabled: true,
};
const DANIEL_PROFILE = {
  id: 'tutorprofile_daniel', user_id: 'user_daniel', bio: 'Daniel bio', average_rating: 0,
  maximum_group_size: 4, physical_enabled: false, online_enabled: true,
};

function setupDynamoMocks() {
  ddbMock.on(ScanCommand).callsFake((input) => {
    if (input.TableName === env.tables.tutorProfiles) {
      return { Items: [ALEX_PROFILE, DANIEL_PROFILE] };
    }
    return { Items: [] };
  });

  ddbMock.on(GetCommand).callsFake((input) => {
    if (input.TableName === env.tables.users && input.Key.id === 'user_alex') {
      return { Item: { id: 'user_alex', full_name: 'Alex Tan', role: 'Tutor' } };
    }
    if (input.TableName === env.tables.users && input.Key.id === 'user_daniel') {
      return { Item: { id: 'user_daniel', full_name: 'Daniel Koh', role: 'Tutor' } };
    }
    if (input.TableName === env.tables.modules && input.Key.id === 'module_it2513') {
      return { Item: IT2513 };
    }
    if (input.TableName === env.tables.tutorProfiles && input.Key.id === 'tutorprofile_alex') {
      return { Item: ALEX_PROFILE };
    }
    if (input.TableName === env.tables.tutorProfiles && input.Key.id === 'tutorprofile_daniel') {
      return { Item: DANIEL_PROFILE };
    }
    return { Item: null };
  });

  ddbMock.on(QueryCommand).callsFake((input) => {
    if (input.IndexName === 'tutorId-index') {
      // TutorVerification lookups
      if (input.TableName === env.tables.tutorVerifications) {
        if (input.ExpressionAttributeValues[':tid'] === 'tutorprofile_alex') {
          return { Items: [{ id: 'v1', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', status: 'Verified' }] };
        }
        if (input.ExpressionAttributeValues[':tid'] === 'tutorprofile_daniel') {
          return { Items: [{ id: 'v2', tutor_id: 'tutorprofile_daniel', module_id: 'module_it2513', status: 'Pending' }] };
        }
      }
      // TutorTopic lookups
      if (input.TableName === env.tables.tutorTopics) {
        if (input.ExpressionAttributeValues[':tid'] === 'tutorprofile_alex') {
          return { Items: [{ id: 't1', tutor_id: 'tutorprofile_alex', module_id: 'module_it2513', topic_name: 'Digital Signatures' }] };
        }
        return { Items: [] };
      }
      // TutorAvailability lookups
      if (input.TableName === env.tables.tutorAvailability) {
        if (input.ExpressionAttributeValues[':tid'] === 'tutorprofile_alex') {
          return { Items: [{ id: 'a1', tutor_id: 'tutorprofile_alex', day_or_date: 'Wednesday', start_time: '13:00', end_time: '16:00', session_mode: 'Both', active: true }] };
        }
        return { Items: [] };
      }
    }
    return { Items: [] };
  });
}

beforeEach(() => {
  ddbMock.reset();
  setupDynamoMocks();
});

describe('GET /api/tutors/search', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/tutors/search');
    expect(res.status).toBe(401);
  });

  it('only returns tutors VERIFIED for the requested module (business rule 1)', async () => {
    const res = await request(app)
      .get('/api/tutors/search')
      .query({ moduleId: 'module_it2513' })
      .set('Authorization', `Bearer ${tokenFor('Tutee')}`);

    expect(res.status).toBe(200);
    const names = res.body.data.tutors.map((t) => t.user.full_name);
    expect(names).toContain('Alex Tan');
    expect(names).not.toContain('Daniel Koh'); // only Pending, must be excluded
  });

  it('filters by topic and excludes tutors who do not teach it', async () => {
    const res = await request(app)
      .get('/api/tutors/search')
      .query({ moduleId: 'module_it2513', topic: 'Digital Signatures' })
      .set('Authorization', `Bearer ${tokenFor('Tutee')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.tutors).toHaveLength(1);
    expect(res.body.data.tutors[0].user.full_name).toBe('Alex Tan');
  });

  it('filters by minRating and excludes tutors below the threshold', async () => {
    const res = await request(app)
      .get('/api/tutors/search')
      .query({ minRating: '4.5' })
      .set('Authorization', `Bearer ${tokenFor('Tutee')}`);

    const names = res.body.data.tutors.map((t) => t.user.full_name);
    expect(names).toContain('Alex Tan');
    expect(names).not.toContain('Daniel Koh'); // rating 0
  });

  it('returns tutors sorted by descending match score', async () => {
    const res = await request(app)
      .get('/api/tutors/search')
      .query({ moduleId: 'module_it2513', topic: 'Digital Signatures', day: 'Wednesday' })
      .set('Authorization', `Bearer ${tokenFor('Tutee')}`);

    const scores = res.body.data.tutors.map((t) => t.match.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(res.body.data.tutors[0].match.reasons).toContain('Verified for IT2513');
  });
});
