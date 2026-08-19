const studyService = require('../services/studyService');
const { ok, created } = require('../utils/response');

async function listMaterials(req, res, next) {
  try {
    // Guarantees the demo sample is present the first time the page loads.
    await studyService.ensureSampleMaterial(req.user.id);
    const materials = await studyService.listOwnMaterials(req.user.id);

    // Reported alongside the list so the page can present the dropzone
    // accurately from the start, instead of accepting a file and only then
    // admitting that storage isn't configured.
    const uploads_enabled = await studyService.uploadsAvailable();

    return ok(res, {
      materials,
      uploads_enabled,
      uploads_disabled_reason: uploads_enabled ? null : studyService.UPLOAD_UNAVAILABLE_MESSAGE,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * The local storage driver returns a URL pointing back at this API, so it needs
 * an absolute base. Derived from the request rather than configured, so it works
 * behind any host, port or proxy without another env var to keep in sync.
 */
function publicBaseUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}`;
}

async function createUploadUrl(req, res, next) {
  try {
    const result = await studyService.createUploadUrl(req.user.id, req.body, {
      baseUrl: publicBaseUrl(req),
    });
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

/**
 * Accepts the raw PUT for a locally stored upload.
 *
 * Deliberately NOT behind requireAuth: the browser sends these bytes with a bare
 * fetch and no Authorization header, exactly as it would to S3. The HMAC
 * signature in the query string is the credential, and it binds the object key
 * (which embeds the owning student) plus an expiry.
 */
async function putBlob(req, res, next) {
  try {
    const result = await studyService.putSignedBlob({
      key: req.query.key,
      expires: req.query.expires,
      signature: req.query.signature,
      body: req.body,
      contentType: req.get('content-type'),
    });
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

/** Serves a locally stored object for a signed download URL. */
async function getBlob(req, res, next) {
  try {
    const filePath = await studyService.resolveSignedBlobPath({
      key: req.query.key,
      expires: req.query.expires,
      signature: req.query.signature,
    });
    return res.sendFile(filePath);
  } catch (err) {
    return next(err);
  }
}

async function registerMaterial(req, res, next) {
  try {
    const material = await studyService.registerMaterial(req.user.id, req.body);
    return created(res, { material });
  } catch (err) {
    return next(err);
  }
}

async function getMaterial(req, res, next) {
  try {
    const material = await studyService.getOwnMaterial(req.user.id, req.params.id);
    return ok(res, { material });
  } catch (err) {
    return next(err);
  }
}

async function getDownloadUrl(req, res, next) {
  try {
    const url = await studyService.getDownloadUrl(req.user.id, req.params.id, {
      baseUrl: publicBaseUrl(req),
    });
    return ok(res, { download_url: url });
  } catch (err) {
    return next(err);
  }
}

async function getResource(req, res, next) {
  try {
    const resource = await studyService.getGeneratedResource(req.user.id, req.params.id, req.params.kind);
    return ok(res, resource);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listMaterials,
  createUploadUrl,
  putBlob,
  getBlob,
  registerMaterial,
  getMaterial,
  getDownloadUrl,
  getResource,
};
