/**
 * Lambda entrypoint for the API Gateway WebSocket API ($connect, $disconnect,
 * $default). Used only in the deployed environment — local development uses
 * the in-process hub in realtime/localHub.js instead.
 *
 * Authentication: the client passes its JWT as a query string parameter on
 * connect (ws://.../production?token=<jwt>), which is the standard approach
 * for API Gateway WebSocket APIs since browsers cannot set headers on a
 * WebSocket handshake. An unverifiable token is rejected at $connect, so an
 * unauthenticated socket is never registered.
 */
const jwt = require('jsonwebtoken');
const env = require('./config/env');
const connectionStore = require('./realtime/connectionStore');

exports.handler = async (event) => {
  const { routeKey, connectionId } = event.requestContext;

  if (routeKey === '$connect') {
    const token = event.queryStringParameters?.token;
    let userId;
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      userId = payload.sub;
    } catch {
      return { statusCode: 401, body: 'Unauthorized' };
    }
    await connectionStore.register(connectionId, userId);
    return { statusCode: 200, body: 'Connected' };
  }

  if (routeKey === '$disconnect') {
    await connectionStore.unregister(connectionId);
    return { statusCode: 200, body: 'Disconnected' };
  }

  // $default — reserved for future client->server messages (typing indicators,
  // read receipts). Chat messages themselves go through the REST API so they
  // are validated and persisted by the same authorization path as everything else.
  return { statusCode: 200, body: 'OK' };
};
