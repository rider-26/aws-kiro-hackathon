const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// Own profile (all roles).
router.get('/me', userController.getOwnProfile);
router.patch('/me', userController.updateOwnProfile);

// Learning summary sharing state — the student's own view of what they share.
router.get('/me/sharing', requireRole('Tutee'), userController.getOwnSharingState);

// Saved tutors (Tutee only).
router.get('/me/saved-tutors', requireRole('Tutee'), userController.listSavedTutors);
router.get('/me/saved-tutors/ids', requireRole('Tutee'), userController.listSavedTutorIds);
router.post('/me/saved-tutors/:tutorId', requireRole('Tutee'), userController.saveTutor);
router.delete('/me/saved-tutors/:tutorId', requireRole('Tutee'), userController.unsaveTutor);

// Tutor-facing learning summary. Access requires BOTH the student's live
// sharing flag and an active booking between them (business rules 9 & 10);
// the service enforces this and returns a specific reason when refused.
router.get('/:studentId/learning-summary', requireRole('Tutor'), userController.getSharedSummary);
router.get('/:studentId/learning-summary/access', requireRole('Tutor'), userController.checkSummaryAccess);

module.exports = router;
