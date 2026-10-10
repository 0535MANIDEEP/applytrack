// Every call to the API goes through this file, so the base URL and
// the token are in one place.
//
// The base URL is a build-time variable. Parcel reads a .env file in
// this folder and replaces process.env.API_URL with the value inside
// it when it bundles.
//
//   no .env file   /api, which is correct in production because the
//                  Express process serves this app and the API from
//                  the same origin
//   .env present   a full URL, which is what the dev server needs
//                  because it runs on a different port

const BASE = process.env.API_URL || '/api';

// The token is kept in localStorage so a refresh does not sign you out.
//
// That is acceptable for a personal tracker and is NOT acceptable for
// anything holding other people's data: localStorage is readable by any
// script the page loads, so one bad dependency can read every token on
// the origin. An httpOnly cookie set by the server cannot be read by
// script at all, which is why a real deployment uses cookies.
export function token() {
  return localStorage.getItem('token');
}

export function saveToken(value) {
  localStorage.setItem('token', value);
}

export function clearToken() {
  localStorage.removeItem('token');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  const t = token();
  if (t) headers.Authorization = 'Bearer ' + t;

  const res = await fetch(BASE + path, { ...options, headers });

  // 204 has no body, so parsing it as JSON would throw.
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  // An expired token should sign the user out rather than leave the
  // app in a state where every request fails with no explanation.
  if (res.status === 401 && token()) {
    clearToken();
    window.location.reload();
  }

  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  register: (email, password) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  list: (page = 1, status = '') => {
    const params = new URLSearchParams({ page: String(page), limit: '10' });
    if (status) params.set('status', status);
    return request('/applications?' + params.toString());
  },
  stats: () => request('/applications/stats'),
  create: (data) =>
    request('/applications', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id, status) =>
    request(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  remove: (id) => request(`/applications/${id}`, { method: 'DELETE' }),
};