import apiClient from './client';

export async function getProgress({ moduleId } = {}) {
  const res = await apiClient.get('/progress', { params: moduleId ? { moduleId } : {} });
  return res.data.data;
}
