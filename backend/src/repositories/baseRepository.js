const { GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const env = require('../config/env');

/**
 * Factory for the repositories, dispatching to whichever storage driver is
 * configured (see env.dbDriver).
 *
 * Every entity in this app shares the same shape — partition key `id`, a
 * handful of secondary indexes for lookups by foreign key — which is what
 * makes a single factory viable, and in turn what made swapping the storage
 * engine a two-file change rather than a rewrite. Entity-specific repositories
 * add their own index query helpers on top of what this returns.
 *
 * The DynamoDB implementation below is unchanged and remains the deployed
 * engine; the SQLite one is loaded lazily so neither driver's dependency is
 * required unless it's actually selected.
 */
function createDynamoRepository(tableName) {
  // Required here rather than at module load so selecting sqlite never
  // constructs an AWS client (which would try to resolve credentials).
  // eslint-disable-next-line global-require
  const ddb = require('../config/ddb');

  async function getById(id) {
    const res = await ddb.send(new GetCommand({ TableName: tableName, Key: { id } }));
    return res.Item || null;
  }

  async function create(item) {
    await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
    return item;
  }

  async function update(id, patch) {
    const keys = Object.keys(patch);
    if (keys.length === 0) return getById(id);

    const expr = keys.map((k) => `#${k} = :${k}`).join(', ');
    const names = keys.reduce((acc, k) => ({ ...acc, [`#${k}`]: k }), {});
    const values = keys.reduce((acc, k) => ({ ...acc, [`:${k}`]: patch[k] }), {});

    const res = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id },
        UpdateExpression: `SET ${expr}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );
    return res.Attributes;
  }

  async function remove(id) {
    await ddb.send(new DeleteCommand({ TableName: tableName, Key: { id } }));
  }

  async function listAll() {
    const res = await ddb.send(new ScanCommand({ TableName: tableName }));
    return res.Items || [];
  }

  async function queryByIndex(indexName, keyConditionExpression, expressionAttributeValues, expressionAttributeNames) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
      })
    );
    return res.Items || [];
  }

  return { getById, create, update, remove, listAll, queryByIndex, tableName };
}

function createRepository(tableName) {
  if (env.dbDriver === 'sqlite') {
    // eslint-disable-next-line global-require
    const createSqliteRepository = require('./sqliteAdapter');
    return createSqliteRepository(tableName);
  }
  return createDynamoRepository(tableName);
}

module.exports = createRepository;
