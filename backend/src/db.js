import pg from "pg";

const { Pool, types } = pg;

// node-postgres returns BIGINT (OID 20) columns as strings by default, since
// they can exceed JS's safe integer range. Every BIGINT column here is an
// epoch-millisecond timestamp, which is nowhere close to that limit, so
// parsing them as plain numbers keeps every existing call site (which
// expects numbers, e.g. `new Date(createdAt)`) working unchanged.
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

// Cloud SQL (Postgres) connection.
//
// On Cloud Run, DB_HOST is a Unix socket path Cloud Run itself creates when
// the service is deployed with --add-cloudsql-instances=<connection-name>:
//   /cloudsql/PROJECT:REGION:INSTANCE
// The pg driver treats a `host` that starts with "/" as a Unix socket
// directory automatically — no extra config needed. In local dev, DB_HOST
// is a normal hostname (e.g. "localhost") and pg connects over TCP instead.
//
// Why Postgres instead of the SQLite file this project started with: SQLite
// lived on the Cloud Run container's local disk, which is wiped every time
// Cloud Run replaces the container instance — not just on a redeploy, but on
// any crash or routine instance recycling. That caused real, repeated data
// loss (accounts disappearing minutes after being created). Cloud SQL is a
// separate, durable service, so the data now survives container restarts.
export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || "pogoarcade",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  max: 5,
});

pool.on("error", (err) => {
  // A dropped idle connection shouldn't crash the whole process.
  console.error("[db] Unexpected error on idle client", err);
});

async function q(text, params) {
  return pool.query(text, params);
}

export async function initSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      games_played INTEGER NOT NULL DEFAULT 0,
      total_score INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      disabled INTEGER NOT NULL DEFAULT 0,
      last_login_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      game_id TEXT NOT NULL,
      points INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      UNIQUE(user_id, game_id)
    );

    CREATE TABLE IF NOT EXISTS score_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      game_id TEXT NOT NULL,
      points INTEGER NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      game_id TEXT NOT NULL,
      starts_at BIGINT,
      ends_at BIGINT,
      status TEXT NOT NULL DEFAULT 'upcoming'
    );

    CREATE TABLE IF NOT EXISTS login_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      ip TEXT,
      user_agent TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    );
  `);
}

export async function getUserByUsername(username) {
  const { rows } = await q("SELECT * FROM users WHERE username = $1", [username.toLowerCase()]);
  return rows[0] || null;
}

// Email isn't guaranteed unique at the DB level (it's optional, added after
// launch), but createUser() rejects a signup that reuses an email already on
// another account, so in practice this returns at most one active match.
export async function getUserByEmail(email) {
  if (!email) return null;
  const { rows } = await q("SELECT * FROM users WHERE email = $1", [
    String(email).trim().toLowerCase(),
  ]);
  return rows[0] || null;
}

export async function getUserById(id) {
  const { rows } = await q("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function createUser({ username, passwordHash, displayName, email }) {
  const { rows } = await q(
    `INSERT INTO users (username, password_hash, display_name, created_at, email)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      username.toLowerCase(),
      passwordHash,
      displayName,
      Date.now(),
      email ? String(email).trim().toLowerCase().slice(0, 120) : null,
    ]
  );
  return rows[0];
}

// Self-healing admin bootstrap: if this username matches ADMIN_USERNAME,
// promote them to admin. Safe to call on every login/signup — it's a no-op
// once the account already has the role (or the env var isn't set / doesn't
// match). This means granting the first admin is just "set an env var and
// log in", no direct DB access or redeploy-time seeding required.
export async function maybePromoteAdmin(user) {
  const adminUsername = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
  if (!adminUsername) return user;
  if (user.username !== adminUsername) return user;
  if (user.role === "admin") return user;
  await q("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
  return getUserById(user.id);
}

export async function recordLogin(userId, { ip, userAgent } = {}) {
  await q(
    "INSERT INTO login_log (user_id, ip, user_agent, created_at) VALUES ($1, $2, $3, $4)",
    [userId, ip || null, userAgent ? String(userAgent).slice(0, 300) : null, Date.now()]
  );
  await q("UPDATE users SET last_login_at = $1 WHERE id = $2", [Date.now(), userId]);
}

// --- Admin helpers -------------------------------------------------------

export async function getAllUsersAdmin() {
  const { rows } = await q(
    `SELECT u.id, u.username, u.display_name, u.email, u.role, u.disabled,
            u.created_at, u.last_login_at, u.games_played, u.total_score,
            (SELECT COUNT(*) FROM login_log l WHERE l.user_id = u.id) AS login_count
     FROM users u ORDER BY u.created_at DESC`
  );
  return rows;
}

export async function getUserLoginHistory(userId, limit = 100) {
  const { rows } = await q(
    "SELECT ip, user_agent, created_at FROM login_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return rows;
}

export async function setUserDisabled(userId, disabled) {
  await q("UPDATE users SET disabled = $1 WHERE id = $2", [disabled ? 1 : 0, userId]);
  return getUserById(userId);
}

// Full cascade delete: account + login history + scores + score log +
// password reset tokens. Wrapped in a transaction so it's all-or-nothing.
// Postgres enforces the foreign keys to `users` (SQLite never did, so this
// list of child tables has to be exhaustive here or the final DELETE fails).
export async function deleteUserCascade(userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM login_log WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM score_log WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM scores WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Cumulative score per (user, game) — points ADD to existing total for that game.
export async function recordScore(userId, gameId, points) {
  const existing = await q("SELECT points FROM scores WHERE user_id = $1 AND game_id = $2", [
    userId,
    gameId,
  ]);
  const newPoints = (existing.rows[0]?.points || 0) + points;
  const now = Date.now();

  await q(
    `INSERT INTO scores (user_id, game_id, points, created_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, game_id) DO UPDATE SET points = $3, created_at = $4`,
    [userId, gameId, newPoints, now]
  );

  await q("INSERT INTO score_log (user_id, game_id, points, created_at) VALUES ($1, $2, $3, $4)", [
    userId,
    gameId,
    points,
    now,
  ]);

  await q(
    `UPDATE users SET games_played = games_played + 1,
     total_score = (SELECT COALESCE(SUM(points),0) FROM scores WHERE user_id = $1)
     WHERE id = $1`,
    [userId]
  );

  return getUserById(userId);
}

export async function getUserScores(userId) {
  const { rows } = await q("SELECT game_id, points FROM scores WHERE user_id = $1", [userId]);
  return rows;
}

export async function getLeaderboard(limit = 50) {
  const { rows } = await q(
    `SELECT username, display_name, total_score, games_played
     FROM users ORDER BY total_score DESC, games_played DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getGameLeaderboard(gameId, limit = 50) {
  const { rows } = await q(
    `SELECT u.username, u.display_name, s.points
     FROM scores s JOIN users u ON u.id = s.user_id
     WHERE s.game_id = $1 ORDER BY s.points DESC LIMIT $2`,
    [gameId, limit]
  );
  return rows;
}

// --- Password reset -------------------------------------------------------
// Tokens are stored only as a SHA-256 hash (see auth.js hashResetToken) so a
// DB read alone can't be used to reset someone's password. Each token is
// single-use and expires after RESET_TOKEN_TTL_MS.
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function createPasswordReset(userId, tokenHash) {
  await q(
    "INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4)",
    [userId, tokenHash, Date.now() + RESET_TOKEN_TTL_MS, Date.now()]
  );
}

export async function getValidPasswordReset(tokenHash) {
  const { rows } = await q(
    "SELECT * FROM password_resets WHERE token_hash = $1 AND used = 0 AND expires_at > $2 ORDER BY id DESC LIMIT 1",
    [tokenHash, Date.now()]
  );
  return rows[0] || null;
}

export async function consumePasswordReset(id) {
  await q("UPDATE password_resets SET used = 1 WHERE id = $1", [id]);
}

export async function updateUserPassword(userId, passwordHash) {
  await q("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}
