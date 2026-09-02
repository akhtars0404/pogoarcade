import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { router } from "./routes.js";
import { attachMultiplayer, MULTIPLAYER_GAMES } from "./multiplayer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built frontend (frontend/dist) is copied here at image build time so this
// one process can serve the API, Socket.io, AND the static site — see the
// root Dockerfile. In local dev this directory won't exist, which is fine:
// the Vite dev server (localhost:5173) serves the frontend instead.
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
// Cloud Run sits behind a load balancer/proxy — without this, req.ip would
// resolve to the proxy's internal address instead of the real client IP,
// which the admin panel's login log relies on.
app.set("trust proxy", true);
app.use(cors({ origin: ORIGIN }));
app.use(express.json());

app.get("/api/health", (req, res) =>
  res.json({ ok: true, multiplayerGames: [...MULTIPLAYER_GAMES] })
);
app.use("/api", router);

// Serve the built frontend (production/Docker only) and fall back to
// index.html for any non-API route so client-side routing (react-router)
// works on direct load and refresh.
app.use(express.static(PUBLIC_DIR));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"), (err) => {
    if (err) next();
  });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGIN } });
attachMultiplayer(io);

server.listen(PORT, () => {
  console.log(`PoGo Arcade backend listening on :${PORT}`);
});
