const idGen = require('../utils/idGen');
const chatMessageRepository = require('../repositories/chatMessageRepository');
const userRepository = require('../repositories/userRepository');
const sessionService = require('./sessionService');
const notificationService = require('./notificationService');
const { publishToUsers } = require('../realtime/publisher');
const { sanitizeUser } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Session chat (spec section 14). Access is gated by
 * sessionService.requireMembership on BOTH read and write, so business rule 6
 * ("only session members can access session chat") is enforced server-side
 * rather than by hiding UI.
 */

/** Attaches sender display info to raw message rows. */
async function hydrateMessages(messages) {
  const senderIds = [...new Set(messages.map((m) => m.sender_id))];
  const senders = await Promise.all(senderIds.map((id) => userRepository.getById(id)));
  const byId = new Map(senders.filter(Boolean).map((u) => [u.id, sanitizeUser(u)]));

  return messages.map((m) => ({
    ...m,
    sender: byId.get(m.sender_id) || null,
  }));
}

async function listMessages(sessionId, user) {
  await sessionService.requireMembership(sessionId, user);
  const messages = await chatMessageRepository.listBySession(sessionId);
  const ordered = [...messages].sort((a, b) => (a.created_date || '').localeCompare(b.created_date || ''));
  return hydrateMessages(ordered);
}

async function sendMessage(sessionId, user, { message }) {
  const trimmed = String(message || '').trim();
  if (!trimmed) throw new ApiError(400, 'Message cannot be empty');
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(400, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`);
  }

  const { session, participants } = await sessionService.requireMembership(sessionId, user);

  if (session.status === 'Cancelled') {
    throw new ApiError(409, 'This session was cancelled, so its chat is closed');
  }

  const created = await chatMessageRepository.create({
    id: idGen('message'),
    session_id: sessionId,
    sender_id: user.id,
    message: trimmed,
    created_date: new Date().toISOString(),
  });

  const [hydrated] = await hydrateMessages([created]);

  // Push to every member's open sockets, then notify the others so the message
  // is discoverable even if they were offline. Both are best-effort.
  const recipientIds = await sessionService.memberUserIds(session, participants);
  const others = recipientIds.filter((id) => id !== user.id);

  try {
    await publishToUsers(recipientIds, {
      type: 'chat_message',
      session_id: sessionId,
      message: hydrated,
    });
  } catch (err) {
    console.warn('[chat] real-time broadcast failed:', err.message);
  }

  await Promise.all(
    others.map((id) =>
      notificationService.notify(id, {
        type: 'NewMessage',
        title: `New message from ${hydrated.sender?.full_name || 'a session member'}`,
        message: trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed,
        link: `/sessions/${sessionId}`,
      })
    )
  );

  return hydrated;
}

module.exports = { listMessages, sendMessage, MAX_MESSAGE_LENGTH };
