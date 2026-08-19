const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { requireAuth } = require('../middleware/auth');

// All notification routes are scoped to the authenticated user — there is no
// route that exposes another user's notifications to anyone, including admins.
router.use(requireAuth);

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.patch('/:id/read', notificationController.markRead);
router.post('/read-all', notificationController.markAllRead);

module.exports = router;
