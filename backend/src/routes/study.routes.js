const express = require('express');
const router = express.Router();
const studyController = require('../controllers/study.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

/**
 * Signed blob transfer for the LOCAL storage driver.
 *
 * Registered BEFORE the auth middleware below, and intentionally so: the browser
 * sends these bytes with a bare fetch and no Authorization header, because that
 * is the only thing it can do when the same client code also has to talk to S3.
 * The credential is the HMAC signature in the query string, which binds the
 * object key — and the key is server-generated and embeds the owning student id,
 * so a valid signature proves this server issued that exact key for that student
 * within the expiry window. See the security note in services/storageService.js.
 *
 * express.raw is scoped to this route only; the global express.json parser would
 * mangle a PDF body.
 */
router.put(
  '/blob',
  express.raw({ type: '*/*', limit: '25mb' }),
  studyController.putBlob
);
router.get('/blob', studyController.getBlob);

// Everything below is private student learning data (business rule 9), so it is
// Tutee-only and every handler additionally scopes by owner id. A tutor's
// limited view of a student's learning summary is a separate, permission-gated
// feature and never reads these routes.
router.use(requireAuth, requireRole('Tutee'));

router.get('/', studyController.listMaterials);
router.post('/upload-url', studyController.createUploadUrl);
router.post('/', studyController.registerMaterial);
router.get('/:id', studyController.getMaterial);
router.get('/:id/download-url', studyController.getDownloadUrl);
router.get('/:id/resources/:kind', studyController.getResource);

module.exports = router;
