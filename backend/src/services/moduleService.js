const idGen = require('../utils/idGen');
const moduleRepository = require('../repositories/moduleRepository');
const { ApiError } = require('../middleware/errorHandler');

async function listActive() {
  const all = await moduleRepository.listAll();
  return all.filter((m) => m.active !== false);
}

async function listAll() {
  return moduleRepository.listAll();
}

async function create({ module_code, module_name, description }) {
  if (!module_code || !module_name) {
    throw new ApiError(400, 'module_code and module_name are required');
  }
  const existing = await moduleRepository.getByCode(module_code);
  if (existing) throw new ApiError(409, `Module ${module_code} already exists`);

  return moduleRepository.create({
    id: idGen('module'),
    module_code,
    module_name,
    description: description || '',
    active: true,
  });
}

async function update(id, patch) {
  const existing = await moduleRepository.getById(id);
  if (!existing) throw new ApiError(404, 'Module not found');
  const EDITABLE = ['module_name', 'description', 'active'];
  const safePatch = {};
  for (const key of EDITABLE) {
    if (patch[key] !== undefined) safePatch[key] = patch[key];
  }
  return moduleRepository.update(id, safePatch);
}

module.exports = { listActive, listAll, create, update };
