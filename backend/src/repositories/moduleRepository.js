const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.modules);

async function getByCode(module_code) {
  const items = await base.queryByIndex(
    'moduleCode-index',
    'module_code = :code',
    { ':code': module_code }
  );
  return items[0] || null;
}

module.exports = { ...base, getByCode };
