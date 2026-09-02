// Talks to the PoGo Arcade backend (see /backend). In production the backend
// serves this frontend itself (same Cloud Run service), so API calls default
// to same-origin (empty string = relative URLs). Local dev overrides this via
// frontend/.env (VITE_API_URL=http://localhost:4000) since the Vite dev
// server and the backend run as two separate processes/ports there.
export const API_URL = import.meta.env.VITE_API_URL || "";
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;

const TOKEN_KEY = "pogoarcade_token";

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  },
};

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  // email is optional — passed through only if the caller supplies one.
  signup: (username, password, displayName, email) =>
    request("/auth/signup", { method: "POST", body: { username, password, displayName, email: email || undefined } }),
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: { username, password } }),
  me: () => request("/auth/me", { auth: true }),
  forgotPassword: (email) => request("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token, password) => request("/auth/reset-password", { method: "POST", body: { token, password } }),
  recordScore: (gameId, points) =>
    request("/scores", { method: "POST", auth: true, body: { gameId, points } }),
  leaderboard: () => request("/leaderboard"),
  gameLeaderboard: (gameId) => request(`/leaderboard/${gameId}`),

  // --- Admin (requires an admin-role account) ---
  adminUsers: () => request("/admin/users", { auth: true }),
  adminUserLogins: (id) => request(`/admin/users/${id}/logins`, { auth: true }),
  adminDisableUser: (id) => request(`/admin/users/${id}/disable`, { method: "POST", auth: true }),
  adminEnableUser: (id) => request(`/admin/users/${id}/enable`, { method: "POST", auth: true }),
  adminDeleteUser: (id) => request(`/admin/users/${id}`, { method: "DELETE", auth: true }),
};
