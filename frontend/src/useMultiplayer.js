import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL, tokenStore } from "./api.js";

// Reusable real-time multiplayer hook for turn-based board games.
// Usage:
//   const mp = useMultiplayer("tictactoe");
//   mp.quickMatch() / mp.createRoom() / mp.joinRoom(code)
//   mp.sendMove(move, state) -> relayed to opponent
//   mp.lastOpponentMove -> { move, state, seq } updates on each incoming move
//   mp.reportGameOver(outcome, points) -> awards score server-side, ends room
export function useMultiplayer(gameId) {
  const socketRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle|connecting|queued|waiting-room|matched|finished|error
  const [error, setError] = useState(null);
  const [room, setRoom] = useState(null); // { roomId, you, opponent, turn, gameId }
  const [roomCode, setRoomCode] = useState(null);
  const [lastOpponentMove, setLastOpponentMove] = useState(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const seqRef = useRef(0);

  const ensureSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const token = tokenStore.get();
    const s = io(`${SOCKET_URL}/game`, { auth: { token }, transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("connect_error", (err) => { setStatus("error"); setError(err.message); });
    s.on("error:message", (msg) => setError(msg));
    s.on("queue:waiting", () => setStatus("queued"));
    s.on("match:found", (payload) => {
      setRoom(payload);
      setRoomCode(null);
      setOpponentLeft(false);
      setStatus("matched");
    });
    s.on("opponent:move", (payload) => {
      seqRef.current += 1;
      setLastOpponentMove({ ...payload, seq: seqRef.current });
      setRoom((r) => (r ? { ...r, turn: payload.turn } : r));
    });
    s.on("opponent:left", () => setOpponentLeft(true));
    s.on("room:finished", () => setStatus("finished"));

    return s;
  }, []);

  const quickMatch = useCallback(() => {
    setError(null);
    setStatus("connecting");
    const s = ensureSocket();
    if (s.connected) s.emit("queue:join", { gameId });
    else s.once("connect", () => s.emit("queue:join", { gameId }));
  }, [ensureSocket, gameId]);

  const createRoom = useCallback(() => {
    setError(null);
    setStatus("connecting");
    const s = ensureSocket();
    const doCreate = () =>
      s.emit("room:create", { gameId }, (ack) => {
        if (ack?.ok) { setRoomCode(ack.code); setStatus("waiting-room"); }
        else { setError(ack?.error || "Could not create room"); setStatus("error"); }
      });
    if (s.connected) doCreate();
    else s.once("connect", doCreate);
  }, [ensureSocket, gameId]);

  const joinRoom = useCallback((code) => {
    setError(null);
    setStatus("connecting");
    const s = ensureSocket();
    const doJoin = () =>
      s.emit("room:join", { code }, (ack) => {
        if (!ack?.ok) { setError(ack?.error || "Could not join room"); setStatus("error"); }
        // on success, match:found event will fire and set status to "matched"
      });
    if (s.connected) doJoin();
    else s.once("connect", doJoin);
  }, [ensureSocket]);

  // nextTurn: 0 or 1 — whose turn comes after this move (lets games like
  // Checkers/Dots & Boxes grant an extra turn instead of always alternating).
  const sendMove = useCallback((state, nextTurn) => {
    if (!socketRef.current || !room) return;
    socketRef.current.emit("move", { roomId: room.roomId, state, nextTurn });
  }, [room]);

  const reportGameOver = useCallback((outcome, points) => {
    if (!socketRef.current || !room) return;
    socketRef.current.emit("game:over", { roomId: room.roomId, outcome, points });
  }, [room]);

  const reset = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("room:leave");
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setStatus("idle"); setRoom(null); setRoomCode(null); setError(null);
    setLastOpponentMove(null); setOpponentLeft(false);
  }, []);

  useEffect(() => () => { if (socketRef.current) socketRef.current.disconnect(); }, []);

  return {
    status, error, room, roomCode, lastOpponentMove, opponentLeft,
    quickMatch, createRoom, joinRoom, sendMove, reportGameOver, reset,
  };
}
