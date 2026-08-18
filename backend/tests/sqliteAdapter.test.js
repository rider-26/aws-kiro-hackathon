/**
 * Tests for the SQLite storage driver.
 *
 * These matter because the driver's job is to be behaviourally
 * indistinguishable from the DynamoDB one — every service in the app was
 * written against DynamoDB semantics. Each test below pins one of those
 * semantics, so a divergence shows up here rather than as a subtle bug in a
 * booking or a chat thread.
 *
 * Note the env override at the top: the rest of the suite runs against the
 * DynamoDB driver (env forces it when NODE_ENV=test, so the aws-sdk-client-mock
 * seam keeps working), so this file opts itself into sqlite with a throwaway
 * database file before anything else loads.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

const TEMP_DB = path.join(os.tmpdir(), `peerlink-adapter-test-${process.pid}.db`);
process.env.SQLITE_PATH = TEMP_DB;

const createSqliteRepository = require('../src/repositories/sqliteAdapter');
const { parseKeyCondition, toSqlValue } = require('../src/repositories/sqliteAdapter');
const { getDb } = require('../src/config/sqlite');
const env = require('../src/config/env');

// Reuse two real tables so the index metadata (including sort keys) is the
// genuine configuration rather than a fixture.
const chat = createSqliteRepository(env.tables.chatMessages);
const perf = createSqliteRepository(env.tables.topicPerformance);
const users = createSqliteRepository(env.tables.users);

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM "${env.tables.chatMessages}"`);
  db.exec(`DELETE FROM "${env.tables.topicPerformance}"`);
  db.exec(`DELETE FROM "${env.tables.users}"`);
});

afterAll(() => {
  getDb().close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${TEMP_DB}${suffix}`, { force: true });
  }
});

// ---------------------------------------------------------------------------
// Key condition translation
// ---------------------------------------------------------------------------
describe('parseKeyCondition', () => {
  it('parses a single equality term', () => {
    expect(parseKeyCondition('student_id = :sid', { ':sid': 'u1' })).toEqual([
      { attribute: 'student_id', value: 'u1' },
    ]);
  });

  it('parses a composite partition + sort key condition', () => {
    const terms = parseKeyCondition('student_id = :sid AND module_id = :mid', {
      ':sid': 'u1',
      ':mid': 'm1',
    });
    expect(terms).toEqual([
      { attribute: 'student_id', value: 'u1' },
      { attribute: 'module_id', value: 'm1' },
    ]);
  });

  it('is case-insensitive about AND and tolerates extra whitespace', () => {
    const terms = parseKeyCondition('  student_id  =  :sid   and   module_id = :mid ', {
      ':sid': 'u1',
      ':mid': 'm1',
    });
    expect(terms).toHaveLength(2);
  });

  it('resolves #placeholder attribute names', () => {
    const terms = parseKeyCondition('#uid = :uid', { ':uid': 'u1' }, { '#uid': 'user_id' });
    expect(terms).toEqual([{ attribute: 'user_id', value: 'u1' }]);
  });

  it('throws rather than guessing on a range condition', () => {
    expect(() => parseKeyCondition('created_date > :d', { ':d': 'x' })).toThrow(/only supports equality/i);
  });

  it('throws rather than guessing on begins_with', () => {
    expect(() => parseKeyCondition('begins_with(sk, :p)', { ':p': 'x' })).toThrow(/only supports equality/i);
  });

  it('throws when a placeholder has no supplied value', () => {
    expect(() => parseKeyCondition('student_id = :sid', {})).toThrow(/missing value/i);
  });
});

describe('toSqlValue', () => {
  it('maps booleans onto what json_extract returns', () => {
    expect(toSqlValue(true)).toBe(1);
    expect(toSqlValue(false)).toBe(0);
  });

  it('passes strings and numbers through', () => {
    expect(toSqlValue('abc')).toBe('abc');
    expect(toSqlValue(42)).toBe(42);
  });

  it('maps undefined and null onto null', () => {
    expect(toSqlValue(undefined)).toBeNull();
    expect(toSqlValue(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DynamoDB-equivalent write semantics
// ---------------------------------------------------------------------------
describe('create', () => {
  it('round-trips an item', async () => {
    await users.create({ id: 'u1', full_name: 'Jinyu Chen', role: 'Tutee' });
    expect(await users.getById('u1')).toEqual({ id: 'u1', full_name: 'Jinyu Chen', role: 'Tutee' });
  });

  it('OVERWRITES an existing id rather than erroring, matching PutCommand', async () => {
    await users.create({ id: 'u1', full_name: 'First', role: 'Tutee' });
    await users.create({ id: 'u1', full_name: 'Second' });

    const stored = await users.getById('u1');
    expect(stored.full_name).toBe('Second');
    // Put replaces the whole item, so the old attribute is gone — not merged.
    expect(stored.role).toBeUndefined();
  });

  it('drops undefined attributes, matching removeUndefinedValues', async () => {
    await users.create({ id: 'u1', full_name: 'Jinyu', course: undefined });
    const stored = await users.getById('u1');
    expect('course' in stored).toBe(false);
  });

  it('preserves falsy values that are not undefined', async () => {
    await users.create({ id: 'u1', share_learning_summary: false, review_count: 0, bio: '' });
    const stored = await users.getById('u1');
    expect(stored.share_learning_summary).toBe(false);
    expect(stored.review_count).toBe(0);
    expect(stored.bio).toBe('');
  });

  it('refuses an item with no id', async () => {
    await expect(users.create({ full_name: 'No Id' })).rejects.toThrow(/without an id/i);
  });
});

describe('update', () => {
  it('MERGES the patch and returns the full item, matching ReturnValues ALL_NEW', async () => {
    await users.create({ id: 'u1', full_name: 'Jinyu', role: 'Tutee', course: 'IT' });
    const updated = await users.update('u1', { course: 'Cybersecurity' });

    expect(updated).toEqual({ id: 'u1', full_name: 'Jinyu', role: 'Tutee', course: 'Cybersecurity' });
    expect(await users.getById('u1')).toEqual(updated);
  });

  it('upserts when the row is absent, matching a SET UpdateExpression', async () => {
    const updated = await users.update('u_new', { full_name: 'Created By Update' });
    expect(updated.id).toBe('u_new');
    expect(updated.full_name).toBe('Created By Update');
    expect(await users.getById('u_new')).not.toBeNull();
  });

  it('is a no-op for an empty patch', async () => {
    await users.create({ id: 'u1', full_name: 'Jinyu' });
    expect(await users.update('u1', {})).toEqual({ id: 'u1', full_name: 'Jinyu' });
  });

  it('can write null to clear a field, as the reinstate flow does', async () => {
    await users.create({ id: 'u1', account_status: 'Suspended', suspended_date: '2026-08-01' });
    const updated = await users.update('u1', { account_status: 'Active', suspended_date: null });

    expect(updated.account_status).toBe('Active');
    expect(updated.suspended_date).toBeNull();
  });

  it('never lets a patch overwrite the id', async () => {
    await users.create({ id: 'u1', full_name: 'Jinyu' });
    const updated = await users.update('u1', { id: 'u_hijack', full_name: 'Changed' });

    expect(updated.id).toBe('u1');
    expect(await users.getById('u_hijack')).toBeNull();
  });
});

describe('getById / remove / listAll', () => {
  it('returns null for a missing id', async () => {
    expect(await users.getById('nope')).toBeNull();
  });

  it('returns null rather than throwing for a null id', async () => {
    expect(await users.getById(null)).toBeNull();
  });

  it('removes a row', async () => {
    await users.create({ id: 'u1', full_name: 'Jinyu' });
    await users.remove('u1');
    expect(await users.getById('u1')).toBeNull();
  });

  it('removing a missing row is not an error', async () => {
    await expect(users.remove('ghost')).resolves.toBeUndefined();
  });

  it('lists every row', async () => {
    await users.create({ id: 'u1', full_name: 'A' });
    await users.create({ id: 'u2', full_name: 'B' });
    expect(await users.listAll()).toHaveLength(2);
  });

  it('returns an empty list for an empty table', async () => {
    expect(await users.listAll()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Index queries — including the implicit sort-key ordering
// ---------------------------------------------------------------------------
describe('queryByIndex', () => {
  it('filters on the partition key only', async () => {
    await perf.create({ id: 'tp1', student_id: 'u1', module_id: 'm1', topic: 'Hashing' });
    await perf.create({ id: 'tp2', student_id: 'u2', module_id: 'm1', topic: 'RSA' });

    const rows = await perf.queryByIndex('studentId-moduleId-index', 'student_id = :sid', { ':sid': 'u1' });
    expect(rows.map((r) => r.id)).toEqual(['tp1']);
  });

  it('filters on partition + sort key together', async () => {
    await perf.create({ id: 'tp1', student_id: 'u1', module_id: 'm1', topic: 'Hashing' });
    await perf.create({ id: 'tp2', student_id: 'u1', module_id: 'm2', topic: 'RSA' });

    const rows = await perf.queryByIndex(
      'studentId-moduleId-index',
      'student_id = :sid AND module_id = :mid',
      { ':sid': 'u1', ':mid': 'm2' }
    );
    expect(rows.map((r) => r.id)).toEqual(['tp2']);
  });

  it('returns an empty array when nothing matches', async () => {
    expect(
      await perf.queryByIndex('studentId-moduleId-index', 'student_id = :sid', { ':sid': 'nobody' })
    ).toEqual([]);
  });

  // This is the behaviour chatMessageRepository depends on: DynamoDB returns
  // rows ordered by the sort key implicitly, SQL does not unless told to.
  it('orders by the sort key ascending, so chat history reads oldest-first', async () => {
    await chat.create({ id: 'm3', session_id: 's1', created_date: '2026-08-18T10:02:00.000Z', message: 'third' });
    await chat.create({ id: 'm1', session_id: 's1', created_date: '2026-08-18T10:00:00.000Z', message: 'first' });
    await chat.create({ id: 'm2', session_id: 's1', created_date: '2026-08-18T10:01:00.000Z', message: 'second' });

    const rows = await chat.queryByIndex('sessionId-createdDate-index', 'session_id = :sid', { ':sid': 's1' });
    expect(rows.map((r) => r.message)).toEqual(['first', 'second', 'third']);
  });

  it('scopes an index query to the requested partition', async () => {
    await chat.create({ id: 'm1', session_id: 's1', created_date: '2026-08-18T10:00:00.000Z' });
    await chat.create({ id: 'm2', session_id: 's2', created_date: '2026-08-18T10:01:00.000Z' });

    const rows = await chat.queryByIndex('sessionId-createdDate-index', 'session_id = :sid', { ':sid': 's2' });
    expect(rows.map((r) => r.id)).toEqual(['m2']);
  });

  it('matches boolean attribute values', async () => {
    await users.create({ id: 'u1', email: 'a@x.demo', share_learning_summary: true });
    const rows = await users.queryByIndex('email-index', 'email = :email', { ':email': 'a@x.demo' });
    expect(rows[0].share_learning_summary).toBe(true);
  });

  it('does not confuse a null attribute with a missing one', async () => {
    // Group sessions are exactly this: booking_id null marks them browsable.
    await chat.create({ id: 'm1', session_id: 's1', created_date: '2026-08-18T10:00:00.000Z', booking_id: null });
    const rows = await chat.queryByIndex('sessionId-createdDate-index', 'session_id = :sid', { ':sid': 's1' });
    expect(rows[0].booking_id).toBeNull();
  });
});
