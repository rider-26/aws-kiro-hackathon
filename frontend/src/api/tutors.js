import apiClient from './client';

export async function listTutors() {
  const res = await apiClient.get('/tutors');
  return res.data.data.tutors;
}

export async function getTutor(id) {
  const res = await apiClient.get(`/tutors/${id}`);
  return res.data.data.tutor;
}

export async function getOwnTutorProfile() {
  const res = await apiClient.get('/tutors/me/profile');
  return res.data.data.tutor;
}

export async function updateOwnTutorProfile(patch) {
  const res = await apiClient.patch('/tutors/me/profile', patch);
  return res.data.data.profile;
}

export async function requestVerification(module_id) {
  const res = await apiClient.post('/tutors/me/verifications', { module_id });
  return res.data.data.verification;
}

export async function addTopic(payload) {
  const res = await apiClient.post('/tutors/me/topics', payload);
  return res.data.data.topic;
}

export async function removeTopic(topicId) {
  await apiClient.delete(`/tutors/me/topics/${topicId}`);
}

export async function listOwnAvailability() {
  const res = await apiClient.get('/tutors/me/availability');
  return res.data.data.availability;
}

export async function addAvailability(payload) {
  const res = await apiClient.post('/tutors/me/availability', payload);
  return res.data.data.availability;
}

export async function updateAvailability(slotId, payload) {
  const res = await apiClient.patch(`/tutors/me/availability/${slotId}`, payload);
  return res.data.data.availability;
}

export async function removeAvailability(slotId) {
  await apiClient.delete(`/tutors/me/availability/${slotId}`);
}
