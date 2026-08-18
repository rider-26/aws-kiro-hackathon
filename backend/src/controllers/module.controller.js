const moduleService = require('../services/moduleService');
const { ok, created } = require('../utils/response');

async function list(req, res, next) {
  try {
    const includeInactive = req.query.all === 'true';
    const modules = includeInactive ? await moduleService.listAll() : await moduleService.listActive();
    return ok(res, { modules });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const mod = await moduleService.create(req.body);
    return created(res, { module: mod });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const mod = await moduleService.update(req.params.id, req.body);
    return ok(res, { module: mod });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, create, update };
