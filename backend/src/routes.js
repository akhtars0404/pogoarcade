import { Router } from "express";
import {
  getUserByUsername,
  createUser,
  recordScore,
  getUserScores,
  getLeaderboard,
  getGameLeaderboard,
  getUserById,
} from "./db.js";
import { hashPassword, verifyPassword, signToken, requireAuth } from "./auth.js";

export const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function publicUser(u) {
  return {
    username: u.username,
    displayName: u.display_name,
    totalScore: u.total_score,
    gamesPlayed: u.games_played,
    scores: Object.fromEntries(getUserScores(u.id).map((s) => [s.game_id, s.points])),
  };
}

router.post("/auth/signup", (req, res) => {
  const { username, password, displayName } = req.body || {};
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
  if (getUserByUsername(username)) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const user = createUser({
    username,
    passwordHash: hashPassword(password),
    displayName: String(displayName).trim().slice(0, 40),
  });
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = username && getUserByUsername(username);
  if (!user || !verifyPassword(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
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
