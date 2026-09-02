import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "node:http";
import { Server } from "socket.io";
import { router } from "./routes.js";
import { attachMultiplayer, MULTIPLAYER_GAMES } from "./multiplayer.js";

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json());

app.get("/api/health", (req, res) =>
  res.json({ ok: true, multiplayerGames: [...MULTIPLAYER_GAMES] })
);
app.use("/api", router);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGIN } });
attachMultiplayer(io);

server.listen(PORT, () => {
  console.log(`PoGo Arcade backend listening on :${PORT}`);
});
