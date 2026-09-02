import { verifySocketToken } from "./auth.js";
import { getUserById, recordScore } from "./db.js";
import { randomUUID } from "node:crypto";

// Games that currently support real-time online multiplayer.
// (Turn-based board games only — physics games like Carrom/Pool/Snooker
// would need server-authoritative physics to be cheat-proof online, which
// is a separate follow-up.)
export const MULTIPLAYER_GAMES = new Set([
  "tictactoe",
  "connect4",
  "chess",
  "checkers",
  "dotsboxes",
]);

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function attachMultiplayer(io) {
  const nsp = io.of("/game");

  // waitingQueue: gameId -> array of socket ids waiting for quick match
  const waitingQueue = new Map();
  // rooms: roomId -> room object
  const rooms = new Map();
  // roomByCode: code -> roomId (only while waiting for 2nd player)
  const roomByCode = new Map();

  nsp.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const payload = verifySocketToken(token);
    if (!payload) return next(new Error("Authentication required — please sign in to play online."));
    const user = getUserById(payload.sub);
    if (!user) return next(new Error("Account not found"));
    socket.data.user = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
    };
    next();
  });

  function leaveQueues(socket) {
    for (const [gameId, ids] of waitingQueue.entries()) {
      const idx = ids.indexOf(socket.id);
      if (idx >= 0) ids.splice(idx, 1);
      if (ids.length === 0) waitingQueue.delete(gameId);
    }
  }

  function otherPlayer(room, socketId) {
    return room.players.find((p) => p.socketId !== socketId);
  }

  function cleanupRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.code) roomByCode.delete(room.code);
    rooms.delete(roomId);
  }

  function startRoom(nsp, gameId, socketA, socketB, code) {
    const roomId = randomUUID();
    const room = {
      id: roomId,
      gameId,
      code: code || null,
      players: [
        { socketId: socketA.id, ...socketA.data.user, slot: 0 },
        { socketId: socketB.id, ...socketB.data.user, slot: 1 },
      ],
      turn: 0,
      finished: false,
      createdAt: Date.now(),
    };
    rooms.set(roomId, room);
    if (code) roomByCode.delete(code);

    socketA.join(roomId);
    socketB.join(roomId);
    socketA.data.roomId = roomId;
    socketB.data.roomId = roomId;

    const payloadFor = (me, opp) => ({
      roomId,
      gameId,
      you: { slot: me.slot, username: me.username, displayName: me.displayName },
      opponent: { slot: opp.slot, username: opp.username, displayName: opp.displayName },
      turn: room.turn,
    });
    socketA.emit("match:found", payloadFor(room.players[0], room.players[1]));
    socketB.emit("match:found", payloadFor(room.players[1], room.players[0]));
  }

  nsp.on("connection", (socket) => {
    socket.on("queue:join", ({ gameId } = {}) => {
      if (!MULTIPLAYER_GAMES.has(gameId)) {
        return socket.emit("error:message", "This game doesn't support online multiplayer yet.");
      }
      leaveQueues(socket);
      const waiting = waitingQueue.get(gameId) || [];
      const opponentId = waiting.shift();
      if (opponentId && nsp.sockets.get(opponentId)) {
        const opponentSocket = nsp.sockets.get(opponentId);
        waitingQueue.set(gameId, waiting);
        startRoom(nsp, gameId, opponentSocket, socket);
      } else {
        waiting.push(socket.id);
        waitingQueue.set(gameId, waiting);
        socket.emit("queue:waiting", { gameId });
      }
    });

    socket.on("queue:leave", () => leaveQueues(socket));

    socket.on("room:create", ({ gameId } = {}, ack) => {
      if (!MULTIPLAYER_GAMES.has(gameId)) {
        return ack?.({ ok: false, error: "This game doesn't support online multiplayer yet." });
      }
      let code = makeRoomCode();
      while (roomByCode.has(code)) code = makeRoomCode();
      const roomId = randomUUID();
      roomByCode.set(code, { roomId, gameId, hostSocketId: socket.id });
      socket.data.pendingRoomCode = code;
      ack?.({ ok: true, code });
    });

    socket.on("room:join", ({ code } = {}, ack) => {
      const entry = code && roomByCode.get(String(code).toUpperCase());
      if (!entry) return ack?.({ ok: false, error: "Room code not found or already started." });
      const hostSocket = nsp.sockets.get(entry.hostSocketId);
      if (!hostSocket || hostSocket.id === socket.id) {
        return ack?.({ ok: false, error: "That room is no longer available." });
      }
      roomByCode.delete(code.toUpperCase());
      ack?.({ ok: true });
      startRoom(nsp, entry.gameId, hostSocket, socket, code.toUpperCase());
    });

    // `nextTurn` (0 or 1) is supplied by the client because a few games grant
    // an extra turn to the same player (multi-jump captures in Checkers,
    // completing a box in Dots & Boxes) instead of always alternating. The
    // server still enforces that you can only move when it's currently your
    // turn — it just trusts the sender's game logic for what comes next.
    socket.on("move", ({ roomId, move, state, nextTurn } = {}) => {
      const room = rooms.get(roomId);
      if (!room || room.finished) return;
      const me = room.players.find((p) => p.socketId === socket.id);
      if (!me) return;
      if (me.slot !== room.turn) return socket.emit("error:message", "It's not your turn.");
      room.turn = nextTurn === 0 || nextTurn === 1 ? nextTurn : room.turn === 0 ? 1 : 0;
      socket.to(roomId).emit("opponent:move", { roomId, move, state, turn: room.turn });
    });

    // Client-reported game end (turn-based games run rule logic client-side).
    // Each client reports its own outcome; server awards points once per room.
    socket.on("game:over", ({ roomId, outcome, points } = {}) => {
      const room = rooms.get(roomId);
      if (!room || room.finished) return;
      const me = room.players.find((p) => p.socketId === socket.id);
      if (!me) return;
      room.finished = true;
      const clamped = Math.max(0, Math.min(200, Math.round(Number(points) || 0)));
      if (clamped > 0) {
        try {
          recordScore(me.id, room.gameId, clamped);
        } catch {
          /* best-effort */
        }
      }
      nsp.to(roomId).emit("room:finished", { by: me.username, outcome });
      setTimeout(() => cleanupRoom(roomId), 5000);
    });

    socket.on("room:leave", () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        socket.to(roomId).emit("opponent:left");
        socket.leave(roomId);
        cleanupRoom(roomId);
      }
      leaveQueues(socket);
    });

    socket.on("disconnect", () => {
      leaveQueues(socket);
      const roomId = socket.data.roomId;
      if (roomId) {
        socket.to(roomId).emit("opponent:left");
        cleanupRoom(roomId);
      }
      if (socket.data.pendingRoomCode) roomByCode.delete(socket.data.pendingRoomCode);
    });
  });
}
