import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "pogoarcade.db");

import fs from "node:fs";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, game_id) ON CONFLICT REPLACE
);

CREATE TABLE IF NOT EXISTS score_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  game_id TEXT NOT NULL,
  starts_at INTEGER,
  ends_at INTEGER,
  status TEXT NOT NULL DEFAULT 'upcoming'
);
`);

// --- Safe migration: add admin-panel columns to an already-populated
// `users` table. SQLite has no "ADD COLUMN IF NOT EXISTS", so we check
// PRAGMA table_info first and only add what's missing. Runs on every boot;
// a no-op once the columns already exist.
const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
if (!userColumns.has("email")) {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT");
}
if (!userColumns.has("role")) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}
if (!userColumns.has("disabled")) {
  db.exec("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.has("last_login_at")) {
  db.exec("ALTER TABLE users ADD COLUMN last_login_at INTEGER");
}

db.exec(`
CREATE TABLE IF NOT EXISTS login_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
`);

export function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username.toLowerCase());
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function createUser({ username, passwordHash, displayName, email }) {
  const stmt = db.prepare(
    "INSERT INTO users (username, password_hash, display_name, created_at, email) VALUES (?, ?, ?, ?, ?)"
  );
  const info = stmt.run(
    username.toLowerCase(),
    passwordHash,
    displayName,
    Date.now(),
    email ? String(email).trim().slice(0, 120) : null
  );
  return getUserById(info.lastInsertRowid);
}

// Self-healing admin bootstrap: if this username matches ADMIN_USERNAME,
// promote them to admin. Safe to call on every login/signup — it's a no-op
// once the account already has the role (or the env var isn't set / doesn't
// match). This means granting the first admin is just "set an env var and
// log in", no direct DB access or redeploy-time seeding required.
export function maybePromoteAdmin(user) {
  const adminUsername = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
  if (!adminUsername) return user;
  if (user.username !== adminUsername) return user;
  if (user.role === "admin") return user;
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
  return getUserById(user.id);
}

export function recordLogin(userId, { ip, userAgent } = {}) {
  db.prepare(
    "INSERT INTO login_log (user_id, ip, user_agent, created_at) VALUES (?, ?, ?, ?)"
  ).run(userId, ip || null, userAgent ? String(userAgent).slice(0, 300) : null, Date.now());
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(Date.now(), userId);
}

// --- Admin helpers -------------------------------------------------------

export function getAllUsersAdmin() {
  return db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.email, u.role, u.disabled,
              u.created_at, u.last_login_at, u.games_played, u.total_score,
              (SELECT COUNT(*) FROM login_log l WHERE l.user_id = u.id) AS login_count
       FROM users u ORDER BY u.created_at DESC`
    )
    .all();
}

export function getUserLoginHistory(userId, limit = 100) {
  return db
    .prepare(
      "SELECT ip, user_agent, created_at FROM login_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(userId, limit);
}

export function setUserDisabled(userId, disabled) {
  db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(disabled ? 1 : 0, userId);
  return getUserById(userId);
}

// Full cascade delete: account + login history + scores + score log.
// Wrapped in a transaction so it's all-or-nothing.
export const deleteUserCascade = db.transaction((userId) => {
  db.prepare("DELETE FROM login_log WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM score_log WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM scores WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
});

// Cumulative score per (user, game) — points ADD to existing total for that game.
export function recordScore(userId, gameId, points) {
  const existing = db
    .prepare("SELECT points FROM scores WHERE user_id = ? AND game_id = ?")
    .get(userId, gameId);
  const newPoints = (existing?.points || 0) + points;

  db.prepare(
    `INSERT INTO scores (user_id, game_id, points, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, game_id) DO UPDATE SET points = ?, created_at = ?`
  ).run(userId, gameId, newPoints, Date.now(), newPoints, Date.now());

  db.prepare(
    "INSERT INTO score_log (user_id, game_id, points, created_at) VALUES (?, ?, ?, ?)"
  ).run(userId, gameId, points, Date.now());

  db.prepare(
    `UPDATE users SET games_played = games_played + 1,
     total_score = (SELECT COALESCE(SUM(points),0) FROM scores WHERE user_id = ?)
     WHERE id = ?`
  ).run(userId, userId);

  return getUserById(userId);
}

export function getUserScores(userId) {
  return db.prepare("SELECT game_id, points FROM scores WHERE user_id = ?").all(userId);
}

export function getLeaderboard(limit = 50) {
  return db
    .prepare(
      `SELECT username, display_name, total_score, games_played
       FROM users ORDER BY total_score DESC, games_played DESC LIMIT ?`
    )
    .all(limit);
}

export function getGameLeaderboard(gameId, limit = 50) {
  return db
    .prepare(
      `SELECT u.username, u.display_name, s.points
       FROM scores s JOIN users u ON u.id = s.user_id
       WHERE s.game_id = ? ORDER BY s.points DESC LIMIT ?`
    )
    .all(gameId, limit);
}
