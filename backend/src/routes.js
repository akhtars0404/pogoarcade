import { Router } from "express";
import {
  getUserByUsername,
  getUserByEmail,
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
  createPasswordReset,
  getValidPasswordReset,
  consumePasswordReset,
  updateUserPassword,
} from "./db.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  requireAdmin,
  generateResetToken,
  hashResetToken,
} from "./auth.js";
import { sendPasswordResetEmail } from "./email.js";

export const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Wraps an async route handler so a thrown/rejected error becomes a 500
// instead of an unhandled rejection that leaves the request hanging
// (Express 4 doesn't catch async errors on its own).
function wrap(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      console.error("[routes] error", err);
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    });
  };
}

async function publicUser(u) {
  const scores = await getUserScores(u.id);
  return {
    username: u.username,
    displayName: u.display_name,
    role: u.role || "user",
    totalScore: u.total_score,
    gamesPlayed: u.games_played,
    scores: Object.fromEntries(scores.map((s) => [s.game_id, s.points])),
  };
}

function clientIp(req) {
  // req.ip respects Express's "trust proxy" setting, which server.js
  // enables so this resolves to the real client IP behind Cloud Run's LB.
  return req.ip || req.socket?.remoteAddress || null;
}

router.post(
  "/auth/signup",
  wrap(async (req, res) => {
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
    if (await getUserByUsername(username)) {
      return res.status(409).json({ error: "Username already taken" });
    }
    if (email && (await getUserByEmail(email))) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    let user = await createUser({
      username,
      passwordHash: hashPassword(password),
      displayName: String(displayName).trim().slice(0, 40),
      email: email ? String(email).trim() : null,
    });
    user = await maybePromoteAdmin(user);
    await recordLogin(user.id, { ip: clientIp(req), userAgent: req.headers["user-agent"] });
    const token = signToken(user);
    res.json({ token, user: await publicUser(user) });
  })
);

router.post(
  "/auth/login",
  wrap(async (req, res) => {
    const { username, password } = req.body || {};
    let user = username && (await getUserByUsername(username));
    if (!user || !verifyPassword(password || "", user.password_hash)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    if (user.disabled) {
      return res.status(403).json({ error: "This account has been disabled" });
    }
    user = await maybePromoteAdmin(user);
    await recordLogin(user.id, { ip: clientIp(req), userAgent: req.headers["user-agent"] });
    const token = signToken(user);
    res.json({ token, user: await publicUser(user) });
  })
);

router.get(
  "/auth/me",
  requireAuth,
  wrap(async (req, res) => {
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: await publicUser(user) });
  })
);

function siteOrigin(req) {
  return process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
}

// Always responds with the same generic message whether or not the email
// matches an account — otherwise this endpoint could be used to check which
// emails are registered. Only accounts that supplied an email can reset this
// way (email is optional at signup); an account with no email on file simply
// never gets a token, silently, from the caller's point of view.
router.post(
  "/auth/forgot-password",
  wrap(async (req, res) => {
    const { email } = req.body || {};
    const generic = {
      ok: true,
      message: "If an account with that email exists, we've sent a password reset link.",
    };
    if (!email || !EMAIL_RE.test(String(email).trim())) return res.json(generic);

    const user = await getUserByEmail(email);
    if (user && !user.disabled) {
      const token = generateResetToken();
      await createPasswordReset(user.id, hashResetToken(token));
      const resetUrl = `${siteOrigin(req)}/reset-password/${token}`;
      await sendPasswordResetEmail(user.email, resetUrl);
    }
    res.json(generic);
  })
);

router.post(
  "/auth/reset-password",
  wrap(async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: "Token and new password are required" });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    const reset = await getValidPasswordReset(hashResetToken(token));
    if (!reset) {
      return res.status(400).json({ error: "This reset link is invalid or has expired — request a new one" });
    }
    await updateUserPassword(reset.user_id, hashPassword(password));
    await consumePasswordReset(reset.id);
    res.json({ ok: true });
  })
);

router.post(
  "/scores",
  requireAuth,
  wrap(async (req, res) => {
    const { gameId, points } = req.body || {};
    if (!gameId || typeof points !== "number" || !Number.isFinite(points)) {
      return res.status(400).json({ error: "gameId and numeric points are required" });
    }
    // clamp to sane bounds so a tampered client can't post absurd scores
    const clamped = Math.max(0, Math.min(1000, Math.round(points)));
    const user = await recordScore(req.userId, String(gameId).slice(0, 40), clamped);
    res.json({ user: await publicUser(user) });
  })
);

router.get(
  "/leaderboard",
  wrap(async (req, res) => {
    res.json({ leaders: await getLeaderboard(50) });
  })
);

router.get(
  "/leaderboard/:gameId",
  wrap(async (req, res) => {
    res.json({ leaders: await getGameLeaderboard(req.params.gameId, 50) });
  })
);

// --- Admin ----------------------------------------------------------------

function publicAdminUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email || null,
    role: u.role,
    disabled: !!u.disabled,
    createdAt: Number(u.created_at),
    lastLoginAt: u.last_login_at == null ? null : Number(u.last_login_at),
    loginCount: u.login_count == null ? undefined : Number(u.login_count),
    gamesPlayed: u.games_played,
    totalScore: u.total_score,
  };
}

router.get(
  "/admin/users",
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const users = await getAllUsersAdmin();
    res.json({ users: users.map(publicAdminUser) });
  })
);

router.get(
  "/admin/users/:id/logins",
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const targetId = Number(req.params.id);
    const target = await getUserById(targetId);
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json({ logins: await getUserLoginHistory(targetId, 100) });
  })
);

router.post(
  "/admin/users/:id/disable",
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const targetId = Number(req.params.id);
    if (targetId === req.userId) {
      return res.status(400).json({ error: "You can't disable your own admin account" });
    }
    const target = await getUserById(targetId);
    if (!target) return res.status(404).json({ error: "User not found" });
    const updated = await setUserDisabled(targetId, true);
    res.json({ user: publicAdminUser({ ...updated, login_count: undefined }) });
  })
);

router.post(
  "/admin/users/:id/enable",
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const targetId = Number(req.params.id);
    const target = await getUserById(targetId);
    if (!target) return res.status(404).json({ error: "User not found" });
    const updated = await setUserDisabled(targetId, false);
    res.json({ user: publicAdminUser({ ...updated, login_count: undefined }) });
  })
);

// Full cascade delete: account + login history + scores + score log. This
// is permanent, per the site owner's explicit choice — there is no undo.
router.delete(
  "/admin/users/:id",
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const targetId = Number(req.params.id);
    if (targetId === req.userId) {
      return res.status(400).json({ error: "You can't delete your own admin account" });
    }
    const target = await getUserById(targetId);
    if (!target) return res.status(404).json({ error: "User not found" });
    await deleteUserCascade(targetId);
    res.json({ ok: true });
  })
);
