const studyService = require('../services/studyService');
const { ok, created } = require('../utils/response');

async function listMaterials(req, res, next) {
  try {
    // Guarantees the demo sample is present the first time the page loads.
    await studyService.ensureSampleMaterial(req.user.id);
    const materials = await studyService.listOwnMaterials(req.user.id);
    return ok(res, { materials });
  } catch (err) {
    return next(err);
  }
}

async function createUploadUrl(req, res, next) {
  try {
    const result = await studyService.createUploadUrl(req.user.id, req.body);
    return ok(res, result);
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
    const url = await studyService.getDownloadUrl(req.user.id, req.params.id);
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
  registerMaterial,
  getMaterial,
  getDownloadUrl,
  getResource,
};
