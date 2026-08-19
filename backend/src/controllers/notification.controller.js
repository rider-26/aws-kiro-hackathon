const notificationService = require('../services/notificationService');
const { ok } = require('../utils/response');

async function list(req, res, next) {
  try {
    const notifications = await notificationService.listForUser(req.user.id);
    const unread = notifications.filter((n) => !n.read).length;
    return ok(res, { notifications, unread });
  } catch (err) {
    return next(err);
  }
}

async function unreadCount(req, res, next) {
  try {
    const unread = await notificationService.countUnread(req.user.id);
    return ok(res, { unread });
  } catch (err) {
    return next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const notification = await notificationService.markRead(req.user.id, req.params.id);
    return ok(res, { notification });
  } catch (err) {
    return next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const updated = await notificationService.markAllRead(req.user.id);
    return ok(res, { updated });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, unreadCount, markRead, markAllRead };
