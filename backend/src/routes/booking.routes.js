const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

// Shared: both roles list their own bookings (the controller branches on role).
router.get('/', requireAuth, requireRole('Tutee', 'Tutor'), bookingController.listMyBookings);
router.get('/:id', requireAuth, requireRole('Tutee', 'Tutor'), bookingController.getBooking);

// Tutee-only actions.
router.post('/', requireAuth, requireRole('Tutee'), bookingController.createBooking);
router.post('/:id/cancel', requireAuth, requireRole('Tutee'), bookingController.cancelBooking);
router.get('/:id/alternatives', requireAuth, requireRole('Tutee'), bookingController.getAlternatives);

// Tutor-only actions.
router.post('/:id/accept', requireAuth, requireRole('Tutor'), bookingController.acceptBooking);
router.post('/:id/decline', requireAuth, requireRole('Tutor'), bookingController.declineBooking);

module.exports = router;
