const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// A tutor's own reviews (read-only) — declared before /:tutorId so 'me' is not
// captured as a tutor id.
router.get('/me', requireRole('Tutor'), reviewController.getOwnReviews);

// Public-to-authenticated reviews for a tutor profile.
router.get('/tutor/:tutorId', reviewController.listForTutor);

// Review creation and its eligibility check are Tutee-only.
router.get('/sessions/:sessionId/eligibility', requireRole('Tutee'), reviewController.getEligibility);
router.post('/sessions/:sessionId', requireRole('Tutee'), reviewController.createReview);

// NOTE: there is deliberately no PATCH or DELETE route here. Reviews are
// immutable once submitted, which is how business rule 8 ("reviews cannot be
// directly edited by tutors") is enforced — there is no edit path for anyone.

module.exports = router;
