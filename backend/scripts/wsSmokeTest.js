/* eslint-disable no-console */
/**
 * Live smoke test for the local WebSocket hub.
 *
 * Verifies the full real-time path without needing AWS: starts an http server
 * with the hub attached, connects a client with a valid JWT, publishes an event
 * through the same publisher the notification service uses, and asserts the
 * client received it. Also confirms an invalid token is rejected.
 *
 * Run with: node scripts/wsSmokeTest.js
 */
const http = require('http');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const env = require('../src/config/env');
const app = require('../src/app');
const localHub = require('../src/realtime/localHub');
const { publishToUser, publishToUsers } = require('../src/realtime/publisher');

const PORT = 5099;
const USER_ID = 'user_smoketest';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const server = http.createServer(app);
  localHub.attach(server);
  await new Promise((resolve) => server.listen(PORT, resolve));

  let failures = 0;

  // --- Case 1: valid token connects and receives a published event ---
  const token = jwt.sign({ sub: USER_ID, role: 'Tutee', email: 'smoke@test.demo' }, env.jwtSecret, { expiresIn: '5m' });
  const client = new WebSocket(`ws://localhost:${PORT}/ws?token=${encodeURIComponent(token)}`);

  const received = [];
  client.on('message', (raw) => received.push(JSON.parse(raw.toString())));

  await new Promise((resolve, reject) => {
    client.on('open', resolve);
    client.on('error', reject);
  });

  await wait(100);

  const delivered = await publishToUser(USER_ID, {
    type: 'notification',
    notification: { id: 'n_smoke', title: 'Smoke test', message: 'It works', read: false },
  });

  await wait(150);

  if (delivered !== 1) {
    console.error(`FAIL: expected 1 delivery, got ${delivered}`);
    failures += 1;
  } else {
    console.log('PASS: publisher reported 1 delivery');
  }

  const gotHandshake = received.some((m) => m.type === 'connected');
  const gotNotification = received.find((m) => m.type === 'notification');

  if (!gotHandshake) {
    console.error('FAIL: did not receive connection handshake');
    failures += 1;
  } else {
    console.log('PASS: received connection handshake');
  }

  if (!gotNotification || gotNotification.notification.title !== 'Smoke test') {
    console.error('FAIL: did not receive the published notification', received);
    failures += 1;
  } else {
    console.log('PASS: received the published notification over the socket');
  }

  client.close();
  await wait(100);

  // --- Case 2: publishing to a user with no live socket is a no-op, not an error ---
  const noneDelivered = await publishToUser('user_nobody', { type: 'notification', notification: {} });
  if (noneDelivered !== 0) {
    console.error(`FAIL: expected 0 deliveries for offline user, got ${noneDelivered}`);
    failures += 1;
  } else {
    console.log('PASS: publishing to an offline user delivered 0 without throwing');
  }

  // --- Case 3: invalid token is rejected ---
  const badClient = new WebSocket(`ws://localhost:${PORT}/ws?token=not-a-real-jwt`);
  const closeCode = await new Promise((resolve) => {
    badClient.on('close', (code) => resolve(code));
    badClient.on('error', () => {});
  });

  if (closeCode !== 4001) {
    console.error(`FAIL: expected close code 4001 for bad token, got ${closeCode}`);
    failures += 1;
  } else {
    console.log('PASS: invalid token rejected with close code 4001');
  }

  // --- Case 4: a chat broadcast reaches two different members simultaneously ---
  const TUTOR_ID = 'user_tutor_smoke';
  const STUDENT_ID = 'user_student_smoke';

  function connectAs(userId) {
    const t = jwt.sign({ sub: userId, role: 'Tutee', email: `${userId}@test.demo` }, env.jwtSecret, { expiresIn: '5m' });
    const c = new WebSocket(`ws://localhost:${PORT}/ws?token=${encodeURIComponent(t)}`);
    const inbox = [];
    c.on('message', (raw) => inbox.push(JSON.parse(raw.toString())));
    return new Promise((resolve, reject) => {
      c.on('open', () => resolve({ socket: c, inbox }));
      c.on('error', reject);
    });
  }

  const [tutorConn, studentConn] = await Promise.all([connectAs(TUTOR_ID), connectAs(STUDENT_ID)]);
  await wait(100);

  const chatDelivered = await publishToUsers([TUTOR_ID, STUDENT_ID], {
    type: 'chat_message',
    session_id: 'session_smoke',
    message: { id: 'm_smoke', message: 'Broadcast check', sender_id: STUDENT_ID },
  });

  await wait(150);

  if (chatDelivered !== 2) {
    console.error(`FAIL: expected chat broadcast to reach 2 sockets, got ${chatDelivered}`);
    failures += 1;
  } else {
    console.log('PASS: chat broadcast reached both session members');
  }

  const tutorGot = tutorConn.inbox.some((m) => m.type === 'chat_message' && m.message.id === 'm_smoke');
  const studentGot = studentConn.inbox.some((m) => m.type === 'chat_message' && m.message.id === 'm_smoke');

  if (!tutorGot || !studentGot) {
    console.error('FAIL: chat message not received by both members', { tutorGot, studentGot });
    failures += 1;
  } else {
    console.log('PASS: both members received the chat message payload');
  }

  tutorConn.socket.close();
  studentConn.socket.close();
  await wait(100);

  server.close();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll WebSocket smoke checks passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
