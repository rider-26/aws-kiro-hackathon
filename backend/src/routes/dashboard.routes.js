const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

// Admin has its own dashboard endpoints under /api/admin (Task 16).
router.get('/', requireAuth, requireRole('Tutee', 'Tutor'), dashboardController.getDashboard);

module.exports = router;
