const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('./env');
const { ALL_TABLES, indexesFor } = require('./indexes');

/**
 * SQLite connection for local development (DB_DRIVER=sqlite).
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

  db = new Database(env.sqlitePath);
  // WAL gives concurrent reads while the seed script writes, and the busy
  // timeout stops a parallel request erroring out on a momentary write lock.
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

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
