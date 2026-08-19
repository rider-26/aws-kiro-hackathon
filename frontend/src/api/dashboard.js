import apiClient from './client';

export async function getDashboard() {
  const res = await apiClient.get('/dashboard');
  return res.data.data;
}
