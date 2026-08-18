import apiClient from './client';

export async function getReviewEligibility(sessionId) {
  const res = await apiClient.get(`/reviews/sessions/${sessionId}/eligibility`);
  return res.data.data;
}

export async function submitReview(sessionId, payload) {
  const res = await apiClient.post(`/reviews/sessions/${sessionId}`, payload);
  return res.data.data;
}

export async function listTutorReviews(tutorId) {
  const res = await apiClient.get(`/reviews/tutor/${tutorId}`);
  return res.data.data.reviews;
}

export async function getOwnReviews() {
  const res = await apiClient.get('/reviews/me');
  return res.data.data;
}

export const RATING_DIMENSIONS = [
  { key: 'knowledge_rating', label: 'Module Knowledge' },
  { key: 'clarity_rating', label: 'Clarity' },
  { key: 'helpfulness_rating', label: 'Helpfulness' },
  { key: 'preparation_rating', label: 'Preparation' },
  { key: 'communication_rating', label: 'Communication' },
  { key: 'overall_rating', label: 'Overall' },
];
