/**
 * In-process WebSocket hub used for LOCAL DEVELOPMENT ONLY.
 *
 * Locally the backend runs as a normal Express server, so there is no API
 * Gateway WebSocket API to push through. This hub attaches a native `ws`
 * server to the same HTTP server and keeps an in-memory map of
 * userId -> Set<socket>. In deployment the publisher uses API Gateway
 * instead and this file is never engaged.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const socketsByUser = new Map();
let attached = false;

function add(userId, socket) {
  if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
  socketsByUser.get(userId).add(socket);
}

function remove(userId, socket) {
  const set = socketsByUser.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) socketsByUser.delete(userId);
}

/**
 * Attaches a ws server to an existing http.Server. The client authenticates
 * by passing its JWT as a query param: ws://localhost:5000/ws?token=<jwt>
 */
function attach(httpServer) {
  if (attached) return;
  // Required lazily so the ws dependency is only loaded in local dev.
  // eslint-disable-next-line global-require
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket, req) => {
    let userId = null;
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      const payload = jwt.verify(token, env.jwtSecret);
      userId = payload.sub;
    } catch {
      socket.close(4001, 'Unauthorized');
      return;
    }

    add(userId, socket);
    socket.send(JSON.stringify({ type: 'connected' }));

    socket.on('close', () => remove(userId, socket));
    socket.on('error', () => remove(userId, socket));
  });

  attached = true;
  console.log('[realtime] local WebSocket hub attached at /ws');
}

function publish(userId, payload) {
  const set = socketsByUser.get(userId);
  if (!set || set.size === 0) return 0;
  const data = JSON.stringify(payload);
  let delivered = 0;
  for (const socket of set) {
    if (socket.readyState === 1) {
      try {
        socket.send(data);
        delivered += 1;
      } catch {
        remove(userId, socket);
      }
    }
  }
  return delivered;
}

function isAttached() {
  return attached;
}

module.exports = { attach, publish, isAttached };
