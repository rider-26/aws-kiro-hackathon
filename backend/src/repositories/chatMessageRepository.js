const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.chatMessages);

/**
 * Messages for a session, oldest-first. The GSI is
 * `sessionId-createdDate-index` (PK: session_id, SK: created_date), so
 * DynamoDB returns them already ordered by the sort key.
 */
async function listBySession(session_id) {
  return base.queryByIndex('sessionId-createdDate-index', 'session_id = :sid', { ':sid': session_id });
}

module.exports = { ...base, listBySession };
