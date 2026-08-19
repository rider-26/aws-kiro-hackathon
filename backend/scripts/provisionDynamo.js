/* eslint-disable no-console */
require('dotenv').config();
const {
  DynamoDBClient, CreateTableCommand, DescribeTableCommand, waitUntilTableExists,
} = require('@aws-sdk/client-dynamodb');
const env = require('../src/config/env');
const { ALL_TABLES, indexesFor } = require('../src/config/indexes');

/**
 * Creates every DynamoDB table and secondary index the app needs.
 *
 * Driven entirely by config/indexes.js, which is the same source of truth the
 * SQLite driver uses to build its indexes. That matters: hand-creating 22 tables
 * and 28 indexes in the AWS console is slow and a mistyped index name surfaces
 * as a runtime ValidationException on some rarely-hit page rather than as a
 * startup failure.
 *
 * Safe to re-run: existing tables are skipped, never modified or deleted. It
 * will NOT add a missing index to a table that already exists (that's an
 * UpdateTable operation with its own backfill semantics) — it reports the
 * discrepancy instead so you can decide.
 *
 * Usage:
 *   npm run provision:dynamo -- --dry-run   # print the plan, touch nothing
 *   npm run provision:dynamo                # create what's missing
 */

const DRY_RUN = process.argv.includes('--dry-run');

function buildTableInput(tableName) {
  const indexes = indexesFor(tableName);

  // Every key in this app is a String. Only attributes used in a key schema are
  // declared — DynamoDB rejects attribute definitions that aren't part of a key.
  const attributeNames = new Set(['id']);
  for (const meta of Object.values(indexes)) {
    attributeNames.add(meta.pk);
    if (meta.sk) attributeNames.add(meta.sk);
  }

  const globalSecondaryIndexes = Object.entries(indexes).map(([indexName, meta]) => ({
    IndexName: indexName,
    KeySchema: [
      { AttributeName: meta.pk, KeyType: 'HASH' },
      ...(meta.sk ? [{ AttributeName: meta.sk, KeyType: 'RANGE' }] : []),
    ],
    // The app reads whole entities off its indexes (a tutor card, a chat
    // message), so a KEYS_ONLY or INCLUDE projection would force a second
    // read per row.
    Projection: { ProjectionType: 'ALL' },
  }));

  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    AttributeDefinitions: [...attributeNames].map((name) => ({
      AttributeName: name,
      AttributeType: 'S',
    })),
    ...(globalSecondaryIndexes.length > 0 ? { GlobalSecondaryIndexes: globalSecondaryIndexes } : {}),
  };
}

function makeClient() {
  const config = { region: env.aws.region };
  if (env.aws.accessKeyId && env.aws.secretAccessKey) {
    config.credentials = {
      accessKeyId: env.aws.accessKeyId,
      secretAccessKey: env.aws.secretAccessKey,
      ...(env.aws.sessionToken ? { sessionToken: env.aws.sessionToken } : {}),
    };
  }
  return new DynamoDBClient(config);
}

async function describe(client, tableName) {
  try {
    const res = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return res.Table;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return null;
    throw err;
  }
}

async function main() {
  const totalIndexes = ALL_TABLES.reduce((sum, t) => sum + Object.keys(indexesFor(t)).length, 0);

  console.log(`\nRegion:  ${env.aws.region}`);
  console.log(`Tables:  ${ALL_TABLES.length}`);
  console.log(`Indexes: ${totalIndexes}`);
  console.log(DRY_RUN ? '\nDRY RUN — nothing will be created.\n' : '\nCreating missing tables...\n');

  if (DRY_RUN) {
    for (const tableName of ALL_TABLES) {
      const indexes = indexesFor(tableName);
      const names = Object.keys(indexes);
      console.log(`  ${tableName}`);
      console.log('    PK: id (S)');
      if (names.length === 0) {
        console.log('    no secondary indexes');
      } else {
        for (const name of names) {
          const { pk, sk } = indexes[name];
          console.log(`    GSI ${name}: ${pk} (S)${sk ? ` / ${sk} (S)` : ''}`);
        }
      }
    }
    console.log('\nRe-run without --dry-run to create these.\n');
    return;
  }

  if (!env.aws.accessKeyId && !process.env.AWS_PROFILE) {
    console.error('No AWS credentials found. Fill in the AWS block in backend/.env first.');
    process.exit(1);
  }

  const client = makeClient();
  const created = [];
  const skipped = [];
  const mismatched = [];

  for (const tableName of ALL_TABLES) {
    const existing = await describe(client, tableName);

    if (existing) {
      // Report index drift rather than silently accepting a table that can't
      // serve every query the app makes.
      const wanted = Object.keys(indexesFor(tableName));
      const actual = (existing.GlobalSecondaryIndexes || []).map((g) => g.IndexName);
      const missing = wanted.filter((name) => !actual.includes(name));

      skipped.push(tableName);
      if (missing.length > 0) {
        mismatched.push({ tableName, missing });
        console.log(`  exists  ${tableName}  MISSING INDEX: ${missing.join(', ')}`);
      } else {
        console.log(`  exists  ${tableName}`);
      }
      continue;
    }

    await client.send(new CreateTableCommand(buildTableInput(tableName)));
    created.push(tableName);
    console.log(`  create  ${tableName}`);
  }

  if (created.length > 0) {
    console.log('\nWaiting for new tables to become ACTIVE...');
    for (const tableName of created) {
      await waitUntilTableExists({ client, maxWaitTime: 300 }, { TableName: tableName });
      console.log(`  active  ${tableName}`);
    }
  }

  console.log(`\n${created.length} created, ${skipped.length} already existed.`);

  if (mismatched.length > 0) {
    console.log('\nWARNING — existing tables are missing indexes the app queries:');
    for (const { tableName, missing } of mismatched) {
      console.log(`  ${tableName}: ${missing.join(', ')}`);
    }
    console.log(
      '\nThis script will not alter existing tables. Add these indexes in the console,\n' +
      'or delete the table and re-run if it holds no data you need.\n'
    );
    process.exit(1);
  }

  console.log('\nNext: npm run seed (with DB_DRIVER=dynamodb) to load demo data.\n');
}

main().catch((err) => {
  console.error('\nProvisioning failed:', err.message);
  if (err.name === 'ExpiredTokenException' || err.name === 'InvalidClientTokenId') {
    console.error('Credentials look expired. AWS Academy / Learner Lab keys rotate each session —');
    console.error('copy fresh values from the lab\'s "AWS Details" panel into backend/.env.\n');
  }
  process.exit(1);
});
