/* eslint-disable no-console */
require('dotenv').config();
const env = require('../src/config/env');
const userRepository = require('../src/repositories/userRepository');

/**
 * Prints every account with its role and status. Handy for confirming what a
 * demo database actually contains before a reset.
 *
 * Usage: npm run db:users
 */
async function main() {
  console.log(`\nStorage: ${env.dbDriver}\n`);
  const users = (await userRepository.listAll()).sort((a, b) =>
    (a.role || '').localeCompare(b.role || '') || (a.email || '').localeCompare(b.email || '')
  );

  for (const u of users) {
    const status = (u.account_status || 'Active') === 'Active' ? '' : `  [${u.account_status}]`;
    console.log(`  ${(u.role || '?').padEnd(6)}  ${(u.email || '').padEnd(30)}  ${u.full_name || ''}${status}`);
  }
  console.log(`\n  ${users.length} accounts\n`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
