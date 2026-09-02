import { Router } from "express";
import {
  getUserByUsername,
  createUser,
  recordScore,
  getUserScores,
  getLeaderboard,
  getGameLeaderboard,
  getUserById,
  maybePromoteAdmin,
  recordLogin,
  getAllUsersAdmin,
  getUserLoginHistory,
  setUserDisabled,
  deleteUserCascade,
} from "./db.js";
import { hashPassword, verifyPassword, signToken, requireAuth, requireAdmin } from "./auth.js";

export const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return {
    username: u.username,
    displayName: u.display_name,
    role: u.role || "user",
    totalScore: u.total_score,
    gamesPlayed: u.games_played,
    scores: Object.fromEntries(getUserScores(u.id).map((s) => [s.game_id, s.points])),
  };
}

function clientIp(req) {
  // req.ip respects Express's "trust proxy" setting, which server.js
  // enables so this resolves to the real client IP behind Cloud Run's LB.
  return req.ip || req.socket?.remoteAddress || null;
}

router.post("/auth/signup", (req, res) => {
  const { username, password, displayName, email } = req.body || {};
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (!USERNAME_RE.test(username)) {
    return res
      .status(400)
      .json({ error: "Username must be 3-20 characters: letters, numbers, underscore only" });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }
  if (String(displayName).trim().length < 1) {
    return res.status(400).json({ error: "Display name is required" });
  }
  // Email is optional (not required for signup/login) — only validated if provided.
  if (email && !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: "That email address doesn't look valid" });
  }
  if (getUserByUsername(username)) {
    return res.status(409).json({ error: "Username already taken" });
  }

  let user = createUser({
    username,
    passwordHash: hashPassword(password),
    displayName: String(displayName).trim().slice(0, 40),
    email: email ? String(email).trim() : null,
  });
  user = maybePromoteAdmin(user);
  recordLogin(user.id, { ip: clientIp(req), userAgent: req.headers["user-agent"] });
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  let user = username && getUserByUsername(username);
  if (!user || !verifyPassword(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  if (user.disabled) {
    return res.status(403).json({ error: "This account has been disabled" });
  }
  user = maybePromoteAdmin(user);
  recordLogin(user.id, { ip: clientIp(req), userAgent: req.headers["user-agent"] });
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get("/auth/me", requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});

router.post("/scores", requireAuth, (req, res) => {
  const { gameId, points } = req.body || {};
  if (!gameId || typeof points !== "number" || !Number.isFinite(points)) {
    return res.status(400).json({ error: "gameId and numeric points are required" });
  }
  // clamp to sane bounds so a tampered client can't post absurd scores
  const clamped = Math.max(0, Math.min(1000, Math.round(points)));
  const user = recordScore(req.userId, String(gameId).slice(0, 40), clamped);
  res.json({ user: publicUser(user) });
});

router.get("/leaderboard", (req, res) => {
  res.json({ leaders: getLeaderboard(50) });
});

router.get("/leaderboard/:gameId", (req, res) => {
  res.json({ leaders: getGameLeaderboard(req.params.gameId, 50) });
});

// --- Admin ----------------------------------------------------------------

function publicAdminUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email || null,
    role: u.role,
    disabled: !!u.disabled,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    loginCount: u.login_count,
    gamesPlayed: u.games_played,
    totalScore: u.total_score,
  };
}

router.get("/admin/users", requireAuth, requireAdmin, (req, res) => {
  res.json({ users: getAllUsersAdmin().map(publicAdminUser) });
});

router.get("/admin/users/:id/logins", requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: "User not found" });
  res.json({ logins: getUserLoginHistory(targetId, 100) });
});

router.post("/admin/users/:id/disable", requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    return res.status(400).json({ error: "You can't disable your own admin account" });
  }
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: "User not found" });
  const updated = setUserDisabled(targetId, true);
  res.json({ user: publicAdminUser({ ...updated, login_count: undefined }) });
});

router.post("/admin/users/:id/enable", requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: "User not found" });
  const updated = setUserDisabled(targetId, false);
  res.json({ user: publicAdminUser({ ...updated, login_count: undefined }) });
});

// Full cascade delete: account + login history + scores + score log. This
// is permanent, per the site owner's explicit choice — there is no undo.
router.delete("/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    return res.status(400).json({ error: "You can't delete your own admin account" });
  }
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: "User not found" });
  deleteUserCascade(targetId);
  res.json({ ok: true });
});
