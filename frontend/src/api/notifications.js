import apiClient from './client';

export async function listNotifications() {
  const res = await apiClient.get('/notifications');
  return res.data.data;
}

export async function getUnreadCount() {
  const res = await apiClient.get('/notifications/unread-count');
  return res.data.data.unread;
}

export async function markNotificationRead(id) {
  const res = await apiClient.patch(`/notifications/${id}/read`);
  return res.data.data.notification;
}

export async function markAllNotificationsRead() {
  const res = await apiClient.post('/notifications/read-all');
  return res.data.data.updated;
}
