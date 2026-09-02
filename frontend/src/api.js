// Talks to the PoGo Arcade backend (see /backend). Set VITE_API_URL in
// production (e.g. https://api.pogoarcade.com); defaults to localhost for dev.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
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
  signup: (username, password, displayName) =>
    request("/auth/signup", { method: "POST", body: { username, password, displayName } }),
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: { username, password } }),
  me: () => request("/auth/me", { auth: true }),
  recordScore: (gameId, points) =>
    request("/scores", { method: "POST", auth: true, body: { gameId, points } }),
  leaderboard: () => request("/leaderboard"),
  gameLeaderboard: (gameId) => request(`/leaderboard/${gameId}`),
};
