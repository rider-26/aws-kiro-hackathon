import apiClient from './client';

export async function listSessions() {
  const res = await apiClient.get('/sessions');
  return res.data.data.sessions;
}

export async function getSession(id) {
  const res = await apiClient.get(`/sessions/${id}`);
  return res.data.data.session;
}

export async function listMessages(sessionId) {
  const res = await apiClient.get(`/sessions/${sessionId}/messages`);
  return res.data.data.messages;
}

export async function sendMessage(sessionId, message) {
  const res = await apiClient.post(`/sessions/${sessionId}/messages`, { message });
  return res.data.data.message;
}

export async function getAttendance(sessionId) {
  const res = await apiClient.get(`/sessions/${sessionId}/attendance`);
  return res.data.data;
}

export async function startSession(sessionId) {
  const res = await apiClient.post(`/sessions/${sessionId}/start`);
  return res.data.data.session;
}

export async function endSession(sessionId) {
  const res = await apiClient.post(`/sessions/${sessionId}/end`);
  return res.data.data.session;
}

export async function checkIn(sessionId, token) {
  const res = await apiClient.post(`/sessions/${sessionId}/check-in`, { token });
  return res.data.data.participant;
}

export async function confirmCompletion(sessionId) {
  const res = await apiClient.post(`/sessions/${sessionId}/confirm-completion`);
  return res.data.data.participant;
}

// --- Group sessions ---

export async function listGroupSessions({ moduleId, includePast } = {}) {
  const params = {};
  if (moduleId) params.moduleId = moduleId;
  if (includePast) params.includePast = 'true';
  const res = await apiClient.get('/sessions/group', { params });
  return res.data.data.sessions;
}

export async function createGroupSession(payload) {
  const res = await apiClient.post('/sessions/group', payload);
  return res.data.data.session;
}

export async function joinGroupSession(sessionId) {
  const res = await apiClient.post(`/sessions/group/${sessionId}/join`);
  return res.data.data;
}

export async function leaveGroupSession(sessionId) {
  const res = await apiClient.post(`/sessions/group/${sessionId}/leave`);
  return res.data.data;
}
