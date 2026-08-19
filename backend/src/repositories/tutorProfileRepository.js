const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.tutorProfiles);

async function getByUserId(user_id) {
  const items = await base.queryByIndex(
    'userId-index',
    'user_id = :uid',
    { ':uid': user_id }
  );
  return items[0] || null;
}

module.exports = { ...base, getByUserId };
