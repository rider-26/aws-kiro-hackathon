const express = require('express');
const router = express.Router();
const studyController = require('../controllers/study.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

// Study material is private student learning data (business rule 9), so these
// routes are Tutee-only and every handler additionally scopes by owner id.
// A tutor's limited view of a student's learning summary is a separate,
// permission-gated feature (Task 14) and never reads these routes.
router.use(requireAuth, requireRole('Tutee'));

router.get('/', studyController.listMaterials);
router.post('/upload-url', studyController.createUploadUrl);
router.post('/', studyController.registerMaterial);
router.get('/:id', studyController.getMaterial);
router.get('/:id/download-url', studyController.getDownloadUrl);
router.get('/:id/resources/:kind', studyController.getResource);

module.exports = router;
