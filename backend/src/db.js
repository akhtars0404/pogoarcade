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

export function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username.toLowerCase());
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function createUser({ username, passwordHash, displayName }) {
  const stmt = db.prepare(
    "INSERT INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)"
  );
  const info = stmt.run(username.toLowerCase(), passwordHash, displayName, Date.now());
  return getUserById(info.lastInsertRowid);
}

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
