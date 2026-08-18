import apiClient from './client';

export async function getOwnProfile() {
  const res = await apiClient.get('/users/me');
  return res.data.data.user;
}

export async function updateOwnProfile(patch) {
  const res = await apiClient.patch('/users/me', patch);
  return res.data.data.user;
}

export async function getSharingState() {
  const res = await apiClient.get('/users/me/sharing');
  return res.data.data;
}

// --- Saved tutors ---

export async function listSavedTutors() {
  const res = await apiClient.get('/users/me/saved-tutors');
  return res.data.data.tutors;
}

export async function listSavedTutorIds() {
  const res = await apiClient.get('/users/me/saved-tutors/ids');
  return res.data.data.tutor_ids;
}

export async function saveTutor(tutorId) {
  const res = await apiClient.post(`/users/me/saved-tutors/${tutorId}`);
  return res.data.data.saved;
}

export async function unsaveTutor(tutorId) {
  const res = await apiClient.delete(`/users/me/saved-tutors/${tutorId}`);
  return res.data.data;
}

// --- Learning summary (tutor-facing) ---

export async function getLearningSummary(studentId) {
  const res = await apiClient.get(`/users/${studentId}/learning-summary`);
  return res.data.data;
}

export async function checkLearningSummaryAccess(studentId) {
  const res = await apiClient.get(`/users/${studentId}/learning-summary/access`);
  return res.data.data;
}
