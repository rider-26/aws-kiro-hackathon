const idGen = require('../utils/idGen');
const notificationRepository = require('../repositories/notificationRepository');
const { publishToUser } = require('../realtime/publisher');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Notification types emitted across the app (spec section 28). Kept as a
 * named list so every producer uses consistent values and the UI can map
 * them to icons.
 */
const NOTIFICATION_TYPES = [
  'BookingRequestReceived',
  'BookingAccepted',
  'BookingDeclined',
  'BookingCancelled',
  'SessionApproaching',
  'NewMessage',
  'SessionCompleted',
  'ReviewAvailable',
  'TutorVerified',
  'ReportUpdated',
];

/**
 * Creates a Notification row and pushes it to the user in real time.
 *
 * The DynamoDB write is the source of truth; the WebSocket push is
 * best-effort (see realtime/publisher.js). A push failure never fails the
 * caller, so notification delivery can't break a booking or chat write.
 */
async function notify(userId, { type, title, message, link }) {
  const notification = await notificationRepository.create({
    id: idGen('notification'),
    user_id: userId,
    type,
    title,
    message,
    link: link || null,
    read: false,
    created_date: new Date().toISOString(),
  });

  try {
    await publishToUser(userId, { type: 'notification', notification });
  } catch (err) {
    console.warn('[notifications] real-time push failed:', err.message);
  }

  return notification;
}

async function listForUser(userId) {
  const items = await notificationRepository.listByUser(userId);
  return items.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
}

async function countUnread(userId) {
  const items = await notificationRepository.listByUser(userId);
  return items.filter((n) => !n.read).length;
}

async function markRead(userId, notificationId) {
  const notification = await notificationRepository.getById(notificationId);
  if (!notification) throw new ApiError(404, 'Notification not found');
  if (notification.user_id !== userId) {
    throw new ApiError(403, 'You can only update your own notifications');
  }
  return notificationRepository.update(notificationId, { read: true });
}

async function markAllRead(userId) {
  const items = await notificationRepository.listByUser(userId);
  const unread = items.filter((n) => !n.read);
  await Promise.all(unread.map((n) => notificationRepository.update(n.id, { read: true })));
  return unread.length;
}

module.exports = { notify, listForUser, countUnread, markRead, markAllRead, NOTIFICATION_TYPES };
