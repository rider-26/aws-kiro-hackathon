/* eslint-disable no-console */
require('dotenv').config();
const env = require('../src/config/env');
const { ALL_TABLES } = require('../src/config/indexes');

/**
 * Prints row counts per table for the local SQLite database, so you can see at
 * a glance whether the seed populated everything the UI needs.
 *
 * Usage: npm run db:stats
 */
if (env.dbDriver !== 'sqlite') {
  console.error(`db:stats only works with DB_DRIVER=sqlite (currently '${env.dbDriver}').`);
  process.exit(1);
}

const { getDb, quote } = require('../src/config/sqlite');

const db = getDb();
let total = 0;
const empty = [];

console.log(`\n${env.sqlitePath}\n`);

for (const table of ALL_TABLES) {
  const { c } = db.prepare(`SELECT COUNT(*) AS c FROM ${quote(table)}`).get();
  total += c;
  if (c === 0) {
    empty.push(table);
  } else {
    console.log(`  ${String(c).padStart(4)}  ${table}`);
  }
}

if (empty.length) {
  console.log(`\n  empty: ${empty.join(', ')}`);
}
console.log(`\n  ${total} rows across ${ALL_TABLES.length - empty.length} populated tables\n`);
