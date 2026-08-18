const { getDb, quote } = require('../config/sqlite');
const { indexMeta } = require('../config/indexes');

/**
 * SQLite implementation of the repository contract, behaviourally matched to
 * the DynamoDB one so services can't tell the difference.
 *
 * The behaviours that had to be reproduced exactly, because app code relies on
 * them:
 *
 *  - `create` overwrites an existing row with the same id (DynamoDB PutCommand
 *    replaces rather than erroring like SQL INSERT would).
 *  - `update` merges the patch into the stored document and returns the FULL
 *    merged item (DynamoDB's ReturnValues: 'ALL_NEW'), and upserts if the row
 *    is absent, which a SET UpdateExpression also does.
 *  - `queryByIndex` returns rows ordered by the index's sort key when it has
 *    one, since DynamoDB does that implicitly and chat history depends on it.
 *  - Attributes that are `undefined` are dropped, matching the document
 *    client's removeUndefinedValues option. JSON.stringify does this for free.
 */

/**
 * Parses a DynamoDB KeyConditionExpression into ordered equality terms.
 *
 * Only the equality forms the app actually uses are supported:
 *   'student_id = :sid'
 *   'student_id = :sid AND module_id = :mid'
 *
 * Anything else (begins_with, BETWEEN, >, <) throws rather than silently
 * returning wrong rows. A grep of the repositories confirms none are used, so
 * this throw is a guard against a future query being added without extending
 * the adapter.
 */
function parseKeyCondition(expression, values, names = {}) {
  const terms = String(expression)
    .split(/\s+AND\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return terms.map((term) => {
    const match = term.match(/^([#\w]+)\s*=\s*(:[\w]+)$/);
    if (!match) {
      throw new Error(
        `sqlite driver only supports equality key conditions, cannot translate: "${term}"`
      );
    }

    const [, rawAttr, placeholder] = match;
    const attribute = rawAttr.startsWith('#') ? names[rawAttr] : rawAttr;
    if (!attribute) {
      throw new Error(`sqlite driver could not resolve attribute name for "${rawAttr}"`);
    }
    if (!(placeholder in values)) {
      throw new Error(`sqlite driver missing value for placeholder "${placeholder}"`);
    }

    return { attribute, value: values[placeholder] };
  });
}

/**
 * SQLite has no boolean or null type in JSON comparisons the way JS does, so
 * values are normalised to what json_extract returns: booleans become 1/0.
 */
function toSqlValue(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  // Objects/arrays are never used as index keys in this app.
  return JSON.stringify(value);
}

function createSqliteRepository(tableName) {
  const table = quote(tableName);

  function parse(row) {
    return row ? JSON.parse(row.doc) : null;
  }

  async function getById(id) {
    if (id === undefined || id === null) return null;
    const row = getDb().prepare(`SELECT doc FROM ${table} WHERE id = ?`).get(String(id));
    return parse(row);
  }

  async function create(item) {
    if (!item || item.id === undefined || item.id === null) {
      throw new Error(`${tableName}: cannot create an item without an id`);
    }
    // INSERT OR REPLACE mirrors PutCommand, which overwrites by key.
    getDb()
      .prepare(`INSERT OR REPLACE INTO ${table} (id, doc) VALUES (?, ?)`)
      .run(String(item.id), JSON.stringify(item));
    return item;
  }

  async function update(id, patch) {
    const key = String(id);
    const existing = await getById(key);

    if (Object.keys(patch || {}).length === 0) return existing;

    // A SET UpdateExpression against a missing key creates the item, so an
    // absent row upserts rather than failing.
    const merged = { ...(existing || { id: key }), ...patch, id: existing ? existing.id : key };

    getDb()
      .prepare(`INSERT OR REPLACE INTO ${table} (id, doc) VALUES (?, ?)`)
      .run(key, JSON.stringify(merged));

    return merged;
  }

  async function remove(id) {
    getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(String(id));
  }

  async function listAll() {
    const rows = getDb().prepare(`SELECT doc FROM ${table}`).all();
    return rows.map(parse);
  }

  async function queryByIndex(indexName, keyConditionExpression, expressionAttributeValues, expressionAttributeNames) {
    const terms = parseKeyCondition(
      keyConditionExpression,
      expressionAttributeValues || {},
      expressionAttributeNames || {}
    );

    const where = terms.map((t) => `json_extract(doc, '$.${t.attribute}') = ?`).join(' AND ');
    const params = terms.map((t) => toSqlValue(t.value));

    // Reproduce DynamoDB's implicit sort-key ordering (ScanIndexForward=true).
    const meta = indexMeta(tableName, indexName);
    const constrained = new Set(terms.map((t) => t.attribute));
    const orderBy =
      meta && meta.sk && !constrained.has(meta.sk)
        ? ` ORDER BY json_extract(doc, '$.${meta.sk}') ASC`
        : '';

    const rows = getDb()
      .prepare(`SELECT doc FROM ${table} WHERE ${where}${orderBy}`)
      .all(...params);

    return rows.map(parse);
  }

  return { getById, create, update, remove, listAll, queryByIndex, tableName };
}

module.exports = createSqliteRepository;
module.exports.parseKeyCondition = parseKeyCondition;
module.exports.toSqlValue = toSqlValue;
