const bookingService = require('../services/bookingService');
const { ok, created } = require('../utils/response');

async function createBooking(req, res, next) {
  try {
    const booking = await bookingService.createBooking(req.user.id, req.body);
    return created(res, { booking });
  } catch (err) {
    return next(err);
  }
}

async function listMyBookings(req, res, next) {
  try {
    const bookings = req.user.role === 'Tutor'
      ? await bookingService.listForTutor(req.user.id, { status: req.query.status })
      : await bookingService.listForStudent(req.user.id);
    return ok(res, { bookings });
  } catch (err) {
    return next(err);
  }
}

async function getBooking(req, res, next) {
  try {
    const booking = await bookingService.getBookingForUser(req.params.id, req.user);
    return ok(res, { booking });
  } catch (err) {
    return next(err);
  }
}

async function acceptBooking(req, res, next) {
  try {
    const result = await bookingService.acceptBooking(req.user.id, req.params.id);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

async function declineBooking(req, res, next) {
  try {
    const booking = await bookingService.declineBooking(req.user.id, req.params.id, req.body);
    return ok(res, { booking });
  } catch (err) {
    return next(err);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const booking = await bookingService.cancelBooking(req.user.id, req.params.id);
    return ok(res, { booking });
  } catch (err) {
    return next(err);
  }
}

async function getAlternatives(req, res, next) {
  try {
    const tutors = await bookingService.getAlternatives(req.params.id, req.user.id);
    return ok(res, { tutors });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createBooking,
  listMyBookings,
  getBooking,
  acceptBooking,
  declineBooking,
  cancelBooking,
  getAlternatives,
};
