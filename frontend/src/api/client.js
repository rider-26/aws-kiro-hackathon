import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
});

// Attach the JWT (if present) to every request automatically.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('peerlink_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Centralize 401 handling: clear session and let the app redirect to login.
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('peerlink_token');
      localStorage.removeItem('peerlink_user');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
