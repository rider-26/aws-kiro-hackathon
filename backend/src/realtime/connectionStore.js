const createRepository = require('../repositories/baseRepository');
const env = require('../config/env');

const repo = createRepository(env.tables.connections);

/**
 * Tracks live WebSocket connections so a notification can be pushed to every
 * device a user currently has open.
 *
 * Row shape: `id` is the API Gateway connectionId, plus a `user_id` attribute
 * indexed by `userId-index` for the reverse lookup.
 *
 * Every function here fails soft: real-time delivery is an enhancement, and
 * the Notification row is always the source of truth. A missing table/index or
 * an expired connection must never break a booking or a chat write, so errors
 * are logged and swallowed rather than thrown.
 */

async function register(connectionId, userId) {
  try {
    await repo.create({
      id: connectionId,
      user_id: userId,
      connected_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[realtime] could not register connection:', err.message);
  }
}

async function unregister(connectionId) {
  try {
    await repo.remove(connectionId);
  } catch (err) {
    console.warn('[realtime] could not unregister connection:', err.message);
  }
}

async function listByUser(userId) {
  try {
    return await repo.queryByIndex('userId-index', 'user_id = :uid', { ':uid': userId });
  } catch (err) {
    console.warn('[realtime] could not look up connections for user:', err.message);
    return [];
  }
}

module.exports = { register, unregister, listByUser };
