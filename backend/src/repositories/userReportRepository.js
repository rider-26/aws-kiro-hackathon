const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.userReports);

async function listByReporter(reporter_id) {
  return base.queryByIndex('reporterId-index', 'reporter_id = :rid', { ':rid': reporter_id });
}

async function listByReportedUser(reported_user_id) {
  return base.queryByIndex('reportedUserId-index', 'reported_user_id = :uid', { ':uid': reported_user_id });
}

module.exports = { ...base, listByReporter, listByReportedUser };
