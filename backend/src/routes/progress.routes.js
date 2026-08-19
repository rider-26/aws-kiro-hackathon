const express = require('express');
const router = express.Router();
const progressController = require('../controllers/progress.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

// Own learning performance only (business rule 9). A tutor's permissioned
// view of a student's summary is a separate feature (Task 14) and does not
// reuse this route.
router.get('/', requireAuth, requireRole('Tutee'), progressController.getOwnProgress);

module.exports = router;
