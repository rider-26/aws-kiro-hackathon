const env = require('../config/env');
const localHub = require('./localHub');
const connectionStore = require('./connectionStore');

/**
 * Single entry point for pushing a real-time event to a user, regardless of
 * where the backend is running:
 *
 *   - Local dev  -> in-process `ws` hub (localHub)
 *   - Deployed   -> API Gateway Management API (@connections POST)
 *
 * Delivery is always best-effort. Callers (notifications, chat) must treat a
 * failed push as non-fatal: the corresponding DynamoDB row has already been
 * written and the frontend reconciles on next fetch.
 */
async function publishToUser(userId, payload) {
  // Local development path.
  if (localHub.isAttached()) {
    return localHub.publish(userId, payload);
  }

  // Deployed path — requires the WebSocket callback URL injected by CDK.
  if (!env.websocketApiEndpoint) return 0;

  let ApiGatewayManagementApiClient;
  let PostToConnectionCommand;
  try {
    // Required lazily so local dev/tests never need this client.
    // eslint-disable-next-line global-require
    ({ ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi'));
  } catch {
    return 0;
  }

  const client = new ApiGatewayManagementApiClient({
    region: env.aws.region,
    endpoint: env.websocketApiEndpoint,
    ...(env.aws.accessKeyId && env.aws.secretAccessKey
      ? { credentials: { accessKeyId: env.aws.accessKeyId, secretAccessKey: env.aws.secretAccessKey } }
      : {}),
  });

  const connections = await connectionStore.listByUser(userId);
  const data = Buffer.from(JSON.stringify(payload));
  let delivered = 0;

  await Promise.all(connections.map(async (conn) => {
    try {
      await client.send(new PostToConnectionCommand({ ConnectionId: conn.id, Data: data }));
      delivered += 1;
    } catch (err) {
      // 410 Gone means the client disconnected without a $disconnect firing.
      if (err.$metadata?.httpStatusCode === 410) {
        await connectionStore.unregister(conn.id);
      } else {
        console.warn('[realtime] push failed:', err.message);
      }
    }
  }));

  return delivered;
}

async function publishToUsers(userIds, payload) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const counts = await Promise.all(unique.map((id) => publishToUser(id, payload)));
  return counts.reduce((a, b) => a + b, 0);
}

module.exports = { publishToUser, publishToUsers };
