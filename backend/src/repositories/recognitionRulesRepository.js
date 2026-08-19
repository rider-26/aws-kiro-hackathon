const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.recognitionRules);

// A single well-known row holds the active thresholds, so admins edit one
// record rather than accumulating competing rule sets.
const SINGLETON_ID = 'recognition_rules_active';

module.exports = { ...base, SINGLETON_ID };
