import apiClient from './client';

/**
 * Fallback list used only if the categories request fails, so the report form
 * still works offline-ish. The backend list is authoritative.
 */
export const REPORT_CATEGORIES = [
  'No Show',
  'Late Cancellation',
  'Inappropriate Behaviour',
  'Harassment or Bullying',
  'Academic Integrity Concern',
  'Misrepresented Expertise',
  'Requesting Payment',
  'Spam or Scam',
  'Other',
];

export const REPORT_STATUSES = ['Pending', 'Under Review', 'Resolved', 'Dismissed'];

export async function listReportCategories() {
  const res = await apiClient.get('/reports/categories');
  return res.data.data.categories;
}

export async function submitReport({ reported_user_id, session_id, category, description }) {
  const res = await apiClient.post('/reports', { reported_user_id, session_id, category, description });
  return res.data.data.report;
}

export async function listOwnReports() {
  const res = await apiClient.get('/reports/me');
  return res.data.data.reports;
}
