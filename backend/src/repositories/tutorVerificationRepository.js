const createRepository = require('./baseRepository');
const env = require('../config/env');

const base = createRepository(env.tables.tutorVerifications);

async function listByTutor(tutor_id) {
  return base.queryByIndex('tutorId-index', 'tutor_id = :tid', { ':tid': tutor_id });
}

async function listByModule(module_id) {
  return base.queryByIndex('moduleId-index', 'module_id = :mid', { ':mid': module_id });
}

/**
 * Verified module ids for a tutor — the only lens through which students
 * should ever see a tutor's module coverage (business rule 1: only verified
 * tutor-module combos display as verified).
 */
async function listVerifiedModuleIdsForTutor(tutor_id) {
  const verifications = await listByTutor(tutor_id);
  return verifications.filter((v) => v.status === 'Verified').map((v) => v.module_id);
}

module.exports = { ...base, listByTutor, listByModule, listVerifiedModuleIdsForTutor };
