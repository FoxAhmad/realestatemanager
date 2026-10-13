import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

// Add a request interceptor to include the auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// An expired or rejected token should send the user to sign in, not leave every page empty.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response && error.response.status;
    const url = (error.config && error.config.url) || '';
    const onLogin = window.location.pathname === '/login';
    if ((status === 401 || status === 403) && !onLogin && !url.includes('/auth/login') && localStorage.getItem('token')) {
      // 403 is also used for role restrictions, so only treat it as a dead session on 401.
      if (status === 401) {
        localStorage.removeItem('token');
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
