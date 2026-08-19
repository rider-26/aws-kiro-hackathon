const express = require('express');
const router = express.Router();
const tutorController = require('../controllers/tutor.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

// Public-to-authenticated-users listing/detail (any logged-in role may view;
// search/filter refinement happens in Task 4).
router.get('/', requireAuth, tutorController.listTutors);
// Must be declared before '/:id' so 'search' isn't swallowed as an :id param.
router.get('/search', requireAuth, tutorController.searchTutors);
router.get('/:id', requireAuth, tutorController.getTutorById);

// Tutor-only self-management routes.
router.get('/me/profile', requireAuth, requireRole('Tutor'), tutorController.getOwnTutorProfile);
router.patch('/me/profile', requireAuth, requireRole('Tutor'), tutorController.updateOwnTutorProfile);

router.post('/me/topics', requireAuth, requireRole('Tutor'), tutorController.addTopic);
router.delete('/me/topics/:topicId', requireAuth, requireRole('Tutor'), tutorController.removeTopic);

router.post('/me/verifications', requireAuth, requireRole('Tutor'), tutorController.requestVerification);

router.get('/me/availability', requireAuth, requireRole('Tutor'), tutorController.listOwnAvailability);
router.post('/me/availability', requireAuth, requireRole('Tutor'), tutorController.addAvailability);
router.patch('/me/availability/:slotId', requireAuth, requireRole('Tutor'), tutorController.updateAvailability);
router.delete('/me/availability/:slotId', requireAuth, requireRole('Tutor'), tutorController.removeAvailability);

module.exports = router;
