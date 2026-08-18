import apiClient from './client';

export async function listQuizzes() {
  const res = await apiClient.get('/quizzes');
  return res.data.data.quizzes;
}

export async function generateQuiz({ study_material_id, question_count }) {
  const res = await apiClient.post('/quizzes/generate', { study_material_id, question_count });
  return res.data.data;
}

export async function getQuiz(id) {
  const res = await apiClient.get(`/quizzes/${id}`);
  return res.data.data;
}

export async function startAttempt(quizId) {
  const res = await apiClient.post(`/quizzes/${quizId}/attempts`);
  return res.data.data.attempt;
}

export async function gradeAnswer(quizId, { question_id, selected_answer, attempt_id }) {
  const res = await apiClient.post(`/quizzes/${quizId}/grade`, { question_id, selected_answer, attempt_id });
  return res.data.data;
}

export async function submitAttempt(quizId, { attempt_id, answers }) {
  const res = await apiClient.post(`/quizzes/${quizId}/submit`, { attempt_id, answers });
  return res.data.data;
}

export async function getAttempt(attemptId) {
  const res = await apiClient.get(`/quizzes/attempts/${attemptId}`);
  return res.data.data;
}

export async function getDiagnosis(attemptId) {
  const res = await apiClient.get(`/quizzes/attempts/${attemptId}/diagnosis`);
  return res.data.data;
}
