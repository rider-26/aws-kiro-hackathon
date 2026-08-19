const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

// Every route here is Admin-only. This is the sole write path for
// TutorVerification status changes (business rule 12: tutors cannot verify
// themselves — no such route exists under /api/tutors).
router.use(requireAuth, requireRole('Admin'));

// Landing page: platform counts plus the two queues needing a decision.
router.get('/dashboard', adminController.getDashboard);

router.get('/verifications', adminController.listVerifications);
router.patch('/verifications/:id', adminController.decideVerification);

// Recognition eligibility thresholds (spec section 22) — configurable by
// admins/lecturers. Changing these never awards anything; it only changes what
// the platform proposes for lecturer approval.
router.get('/recognition-rules', adminController.getRecognitionRules);
router.patch('/recognition-rules', adminController.updateRecognitionRules);

// Moderation queue (spec section 26). PATCH /reports/:id/action is the only
// route in the app that can suspend an account, and it is Admin-only by the
// router.use above.
router.get('/reports', adminController.listReports);
router.get('/reports/:id', adminController.getReport);
router.patch('/reports/:id/action', adminController.actionReport);
router.post('/users/:userId/reinstate', adminController.reinstateUser);

// Oversight rosters and session RECORDS (spec section 24). Note there is
// deliberately no route exposing session chat to admins — private conversations
// stay scoped to session members (business rule 6).
router.get('/students', adminController.listStudents);
router.get('/tutors', adminController.listTutors);
router.get('/sessions', adminController.listSessions);
router.get('/users/:userId', adminController.getUserDetail);

// Aggregate analytics (spec section 27) — counts and averages only.
router.get('/analytics', adminController.getAnalytics);

module.exports = router;
