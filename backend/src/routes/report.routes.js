const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

// Reporting is open to both parties in a session (spec section 25), so both
// Tutee and Tutor reach these routes. Admins moderate through /api/admin/reports
// instead — they have no need to file reports through this form.
router.use(requireAuth, requireRole('Tutee', 'Tutor'));

router.get('/categories', reportController.getCategories);

// A reporter can list the reports THEY filed and nothing else. There is
// deliberately no GET /:id and no PATCH/DELETE here: once filed, a report is
// the admin's record to action, not the reporter's to edit or withdraw.
router.get('/me', reportController.listOwnReports);
router.post('/', reportController.createReport);

module.exports = router;
