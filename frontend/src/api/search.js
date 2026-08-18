import apiClient from './client';

export async function searchTutors(filters = {}) {
  const params = {};
  if (filters.moduleId) params.moduleId = filters.moduleId;
  if (filters.topic) params.topic = filters.topic;
  if (filters.day) params.day = filters.day;
  if (filters.sessionType) params.sessionType = filters.sessionType;
  if (filters.mode) params.mode = filters.mode;
  if (filters.minRating) params.minRating = filters.minRating;
  if (filters.groupSize) params.groupSize = filters.groupSize;
  if (filters.weakTopics?.length) params.weakTopics = filters.weakTopics.join(',');
  if (filters.preferredTopics?.length) params.preferredTopics = filters.preferredTopics.join(',');

  const res = await apiClient.get('/tutors/search', { params });
  return res.data.data.tutors;
}
