import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { getUserById } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES = "30d";

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role || "user" },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Express middleware: requires a valid Bearer token. Re-checks the live DB
// row (not just the JWT payload) so a disabled account is rejected
// immediately, even with a still-valid token from before it was disabled.
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const payload = token && verifyToken(token);
    if (!payload) return res.status(401).json({ error: "Not authenticated" });
    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (user.disabled) return res.status(403).json({ error: "This account has been disabled" });
    req.userId = user.id;
    req.username = user.username;
    req.userRole = user.role;
    next();
  } catch (err) {
    console.error("[auth] requireAuth error", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// Express middleware: requires an authenticated admin. Always run after
// requireAuth.
export function requireAdmin(req, res, next) {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Same check, usable for Socket.io handshake auth.
export function verifySocketToken(token) {
  return token ? verifyToken(token) : null;
}

// --- Password reset tokens -------------------------------------------------
// The raw token goes out in the emailed link; only its hash is ever stored,
// so a database read alone can't be replayed to reset someone's password.
export function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}
export function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
