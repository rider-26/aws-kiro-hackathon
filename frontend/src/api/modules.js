import apiClient from './client';

export async function listModules({ all = false } = {}) {
  const res = await apiClient.get('/modules', { params: all ? { all: 'true' } : {} });
  return res.data.data.modules;
}

export async function createModule(payload) {
  const res = await apiClient.post('/modules', payload);
  return res.data.data.module;
}

export async function updateModule(id, patch) {
  const res = await apiClient.patch(`/modules/${id}`, patch);
  return res.data.data.module;
}
