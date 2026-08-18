/* eslint-disable no-console */
require('dotenv').config();
const env = require('../config/env');
const { seedUsers } = require('./seedUsers');
const { seedModules } = require('./seedModules');
const { seedTutors } = require('./seedTutors');
const { seedDemoHistory } = require('./seedDemoHistory');
const { seedGroupSessions } = require('./seedGroupSessions');
const { seedReports } = require('./seedReports');

/**
 * Orchestrates all seed steps. Each step is additive/idempotent (re-running
 * won't create duplicates, since each step checks for existing records
 * first). Later tasks append more steps here (quizzes, sample
 * bookings/sessions/reviews) as those domains are built.
 */
async function main() {
  console.log(`Storage driver: ${env.dbDriver}${env.dbDriver === 'sqlite' ? ` (${env.sqlitePath})` : ''}`);

  // --reset wipes every table first. Only offered for sqlite: the local file is
  // disposable, whereas silently truncating provisioned DynamoDB tables from a
  // seed script is exactly the kind of destructive surprise to avoid.
  if (process.argv.includes('--reset')) {
    if (env.dbDriver !== 'sqlite') {
      console.error('--reset is only supported with DB_DRIVER=sqlite. Refusing to truncate DynamoDB tables.');
      process.exit(1);
    }
    // eslint-disable-next-line global-require
    require('../config/sqlite').truncateAll();
    console.log('Local database cleared.\n');
  }

  console.log('Seeding users...');
  const users = await seedUsers();

  console.log('\nSeeding modules...');
  const modules = await seedModules();

  console.log('\nSeeding tutor profiles...');
  const tutors = await seedTutors(users, modules);

  console.log('\nSeeding demo quiz history (Jinyu\'s first attempt)...');
  await seedDemoHistory(users, modules);

  console.log('\nSeeding group sessions...');
  await seedGroupSessions(users, modules, tutors);

  console.log('\nSeeding moderation queue reports...');
  await seedReports(users);

  console.log('\nSeed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
