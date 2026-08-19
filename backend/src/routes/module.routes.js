const express = require('express');
const router = express.Router();
const moduleController = require('../controllers/module.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, moduleController.list);
router.post('/', requireAuth, requireRole('Admin'), moduleController.create);
router.patch('/:id', requireAuth, requireRole('Admin'), moduleController.update);

module.exports = router;
