const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.notifications);

async function listByUser(user_id) {
  return base.queryByIndex('userId-createdDate-index', 'user_id = :uid', { ':uid': user_id });
}

module.exports = { ...base, listByUser };
