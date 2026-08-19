const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/session.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

// Sessions and their chat are available to Tutees and Tutors only — every
// handler additionally verifies session membership (business rule 6), so a
// valid role alone is never sufficient to read another session's messages.
router.use(requireAuth, requireRole('Tutee', 'Tutor'));

router.get('/', sessionController.listMySessions);

// Group sessions (spec section 13). Declared before '/:id' so 'group' is not
// captured as a session id. Tutees browse open sessions; tutors see their own.
router.get('/group', sessionController.listGroupSessions);
router.post('/group', requireRole('Tutor'), sessionController.createGroupSession);
router.post('/group/:id/join', requireRole('Tutee'), sessionController.joinGroupSession);
router.post('/group/:id/leave', requireRole('Tutee'), sessionController.leaveGroupSession);

router.get('/:id', sessionController.getSession);

router.get('/:id/messages', sessionController.listMessages);
router.post('/:id/messages', sessionController.sendMessage);

// Attendance (spec section 21). Membership is verified inside the service for
// every one of these; start/end additionally require being the session's tutor.
router.get('/:id/attendance', sessionController.getAttendance);
router.post('/:id/start', requireRole('Tutor'), sessionController.startSession);
router.post('/:id/end', requireRole('Tutor'), sessionController.endSession);
router.post('/:id/check-in', requireRole('Tutee'), sessionController.checkIn);
router.post('/:id/confirm-completion', requireRole('Tutee'), sessionController.confirmCompletion);

module.exports = router;
