/**
 * Silence ONLY node:sqlite's "experimental feature" notice.
 *
 * Installed BEFORE requiring node:sqlite, because the warning is emitted as the
 * module loads. It goes to stderr, which makes every script run look like it
 * failed under PowerShell (any stderr output surfaces as a NativeCommandError)
 * and muddies CI logs. The warning says nothing beyond what is documented below,
 * and this filter is deliberately narrow — every other Node warning still comes
 * through, including future deprecations.
 */
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const text = typeof warning === 'string' ? warning : warning?.message || '';
  if (/SQLite is an experimental feature/i.test(text)) return undefined;
  return originalEmitWarning.call(process, warning, ...rest);
};

const fs = require('fs');
const path = require('path');
// eslint-disable-next-line import/order
const { DatabaseSync } = require('node:sqlite');
const env = require('./env');
const { ALL_TABLES, indexesFor } = require('./indexes');

/**
 * SQLite connection for local development (DB_DRIVER=sqlite).
 *
 * Uses Node's BUILT-IN `node:sqlite` rather than the `better-sqlite3` package.
 * That is a deliberate choice: better-sqlite3 is a native addon, so it needs
 * either a prebuilt binary matching your exact Node version and platform or a
 * working C++ toolchain to compile one. On a machine without Visual Studio
 * build tools that install simply fails, which makes "clone and run" unreliable
 * — the exact problem this driver exists to solve. `node:sqlite` ships with Node
 * (22.5+), so there is nothing to compile, nothing to download, and no native
 * binary that could end up in a Lambda bundle built for the wrong OS.
 *
 * The tradeoff: `node:sqlite` is still flagged experimental, so Node prints a
 * warning on first use and the API could shift in a future release. Acceptable
 * for a local development driver, and strictly better than a dependency that
 * will not install at all. The API surface used here (exec / prepare / get /
 * all / run / close) is the same shape better-sqlite3 offers, so swapping back
 * later would be a change to this file alone.
 *
 * SCHEMA DESIGN — deliberately document-oriented rather than one column per
 * field. Every table is:
 *
 *     id TEXT PRIMARY KEY, doc TEXT NOT NULL   (doc = the entity as JSON)
 *
 * with an expression index on each attribute the app actually queries, taken
 * from config/indexes.js. The reason: the entities were designed against
 * DynamoDB and are schemaless, so 22 hand-written column schemas would mean
 * every future field addition becomes a migration, and any field the schema
 * forgot would be silently dropped on write. Storing the document whole means
 * the SQLite driver is behaviourally interchangeable with the DynamoDB one and
 * no service or repository code has to change.
 *
 * The tradeoff is that this gives up SQL's type checking and relational
 * constraints. That's the right call here because the app is already written
 * against a schemaless store — adding constraints now would enforce invariants
 * the DynamoDB path doesn't, so the two drivers would diverge.
 */

let db = null;

function quote(identifier) {
  // Table names come from config, never from user input, but quoting keeps
  // names with underscores/case unambiguous and closes the injection path.
  return `"${identifier.replace(/"/g, '""')}"`;
}

function createSchema(database) {
  for (const table of ALL_TABLES) {
    database.exec(
      `CREATE TABLE IF NOT EXISTS ${quote(table)} (
         id  TEXT PRIMARY KEY,
         doc TEXT NOT NULL
       )`
    );

    // One expression index per queried attribute, so GSI-equivalent lookups
    // don't degrade into full scans as the demo data grows.
    const indexes = indexesFor(table);
    const attributes = new Set();
    for (const meta of Object.values(indexes)) {
      attributes.add(meta.pk);
      if (meta.sk) attributes.add(meta.sk);
    }

    for (const attr of attributes) {
      const indexName = `idx_${table}_${attr}`;
      database.exec(
        `CREATE INDEX IF NOT EXISTS ${quote(indexName)}
           ON ${quote(table)} (json_extract(doc, '$.${attr}'))`
      );
    }
  }
}

function getDb() {
  if (db) return db;

  const dir = path.dirname(env.sqlitePath);
  fs.mkdirSync(dir, { recursive: true });

  db = new DatabaseSync(env.sqlitePath);
  // WAL gives concurrent reads while the seed script writes, and the busy
  // timeout stops a parallel request erroring out on a momentary write lock.
  // Issued as SQL because node:sqlite has no dedicated pragma() helper.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');

  createSchema(db);
  return db;
}

/** Drops every row from every table. Used by the seed script's --reset flag. */
function truncateAll() {
  const database = getDb();
  for (const table of ALL_TABLES) {
    database.exec(`DELETE FROM ${quote(table)}`);
  }
}

module.exports = { getDb, truncateAll, quote };
