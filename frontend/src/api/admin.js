import apiClient from './client';

/** Returns { verifications, counts, statuses } — counts drive the queue tabs. */
export async function listVerifications({ status } = {}) {
  const res = await apiClient.get('/admin/verifications', {
    params: status ? { status } : {},
  });
  return res.data.data;
}

export async function decideVerification(id, { status, admin_notes }) {
  const res = await apiClient.patch(`/admin/verifications/${id}`, { status, admin_notes });
  return res.data.data.verification;
}

export async function getRecognitionRules() {
  const res = await apiClient.get('/admin/recognition-rules');
  return res.data.data.rules;
}

export async function updateRecognitionRules(patch) {
  const res = await apiClient.patch('/admin/recognition-rules', patch);
  return res.data.data.rules;
}

// --- Moderation queue (spec section 26) --------------------------------------

export async function listReports({ status } = {}) {
  const res = await apiClient.get('/admin/reports', { params: status ? { status } : {} });
  return res.data.data;
}

export async function getReport(id) {
  const res = await apiClient.get(`/admin/reports/${id}`);
  return res.data.data.report;
}

export async function actionReport(id, { action, admin_notes }) {
  const res = await apiClient.patch(`/admin/reports/${id}/action`, { action, admin_notes });
  return res.data.data;
}

export async function reinstateUser(userId) {
  const res = await apiClient.post(`/admin/users/${userId}/reinstate`);
  return res.data.data.user;
}

// --- Oversight views (spec sections 23, 24, 27) ------------------------------

export async function getAdminDashboard() {
  const res = await apiClient.get('/admin/dashboard');
  return res.data.data;
}

export async function listStudents({ search } = {}) {
  const res = await apiClient.get('/admin/students', { params: search ? { search } : {} });
  return res.data.data.students;
}

export async function listTutors({ search } = {}) {
  const res = await apiClient.get('/admin/tutors', { params: search ? { search } : {} });
  return res.data.data.tutors;
}

export async function listAdminSessions({ status, moduleId } = {}) {
  const res = await apiClient.get('/admin/sessions', {
    params: { ...(status ? { status } : {}), ...(moduleId ? { moduleId } : {}) },
  });
  return res.data.data.sessions;
}

export async function getAnalytics() {
  const res = await apiClient.get('/admin/analytics');
  return res.data.data;
}
