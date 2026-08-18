const idGen = require('../utils/idGen');
const moduleRepository = require('../repositories/moduleRepository');

const SEED_MODULES = [
  { module_code: 'IT2513', module_name: 'Information Security', description: 'Cryptography, hashing, digital signatures, certificates and secure system design.' },
  { module_code: 'IT2511', module_name: 'Network Security', description: 'Network defence, firewalls, intrusion detection and secure protocols.' },
  { module_code: 'IT1913', module_name: 'Database Systems', description: 'Relational modelling, SQL, normalization and transactions.' },
  { module_code: 'IT2143', module_name: 'Software Engineering', description: 'SDLC, requirements, design patterns and testing.' },
  { module_code: 'IT2723', module_name: 'Cloud Computing', description: 'Cloud service models, virtualization and distributed systems.' },
];

async function seedModules() {
  const created = {};
  for (const m of SEED_MODULES) {
    let existing = await moduleRepository.getByCode(m.module_code);
    if (!existing) {
      existing = await moduleRepository.create({
        id: idGen('module'),
        ...m,
        active: true,
      });
    }
    created[m.module_code] = existing;
    // eslint-disable-next-line no-console
    console.log(`  module: ${m.module_code} -> ${existing.id}`);
  }
  return created;
}

module.exports = { seedModules, SEED_MODULES };
