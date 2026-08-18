import apiClient from './client';

export async function createBooking(payload) {
  const res = await apiClient.post('/bookings', payload);
  return res.data.data.booking;
}

export async function listBookings({ status } = {}) {
  const res = await apiClient.get('/bookings', { params: status ? { status } : {} });
  return res.data.data.bookings;
}

export async function getBooking(id) {
  const res = await apiClient.get(`/bookings/${id}`);
  return res.data.data.booking;
}

export async function acceptBooking(id) {
  const res = await apiClient.post(`/bookings/${id}/accept`);
  return res.data.data;
}

export async function declineBooking(id, decline_reason) {
  const res = await apiClient.post(`/bookings/${id}/decline`, { decline_reason });
  return res.data.data.booking;
}

export async function cancelBooking(id) {
  const res = await apiClient.post(`/bookings/${id}/cancel`);
  return res.data.data.booking;
}

export async function getAlternatives(id) {
  const res = await apiClient.get(`/bookings/${id}/alternatives`);
  return res.data.data.tutors;
}

export const DECLINE_REASONS = [
  'Scheduling Conflict',
  'Capacity Reached',
  'Topic Outside Expertise',
  'Unavailable',
  'Other',
];
