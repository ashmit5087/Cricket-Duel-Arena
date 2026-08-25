import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { redisSub, CHANNELS, cacheGet, TTL } from "../db/redis";
import { logger } from "../utils/logger";

let io: SocketServer | null = null;

// ── Room names ────────────────────────────────────────────────────────────────

const ROOMS = {
  liveMatch:  (matchId: string) => `match:${matchId}`,
  player:     (playerId: string) => `player:${playerId}`,
  battle:     (p1: string, p2: string) => `battle:${[p1, p2].sort().join("_")}`,
  global:     "global",
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin:      [
        "http://localhost:5173",
        "http://localhost:3000",
        process.env.FRONTEND_URL ?? "",
      ].filter(Boolean),
      methods:     ["GET", "POST"],
      credentials: true,
    },
    pingTimeout:  20000,
    pingInterval: 10000,
  });

  // ── Connection handler ──────────────────────────────────────────────────────

  io.on("connection", (socket: Socket) => {
    logger.debug(`[socket] Client connected: ${socket.id}`);

    // Client wants live match updates
    socket.on("subscribe:match", async (matchId: string) => {
      socket.join(ROOMS.liveMatch(matchId));
      logger.debug(`[socket] ${socket.id} subscribed to match ${matchId}`);

      // Send current cached state immediately
      const cached = await cacheGet(`live:match:${matchId}`);
      if (cached) socket.emit("live_state", cached);
    });

    socket.on("unsubscribe:match", (matchId: string) => {
      socket.leave(ROOMS.liveMatch(matchId));
    });

    // Client watching a player card
    socket.on("subscribe:player", async (playerId: string) => {
      socket.join(ROOMS.player(playerId));
      const cached = await cacheGet(`player:momentum:${playerId}`);
      if (cached) socket.emit("momentum_update", cached);
    });

    // Client in a battle arena
    socket.on("subscribe:battle", (p1Id: string, p2Id: string) => {
      socket.join(ROOMS.battle(p1Id, p2Id));
    });

    socket.on("disconnect", (reason) => {
      logger.debug(`[socket] Client disconnected: ${socket.id} — ${reason}`);
    });
  });

  // ── Redis pub/sub → broadcast to Socket.io rooms ───────────────────────────

  subscribeToRedis();

  logger.info("[socket] Socket.io server initialized");
  return io;
}

function subscribeToRedis(): void {
  const channels = Object.values(CHANNELS);
  redisSub.subscribe(...channels, (err: any) => {
    if (err) logger.error("[socket] Redis subscribe failed", { error: err.message });
    else logger.info(`[socket] Subscribed to ${channels.length} Redis channels`);
  });

  redisSub.on("message", (channel: string, raw: string) => {
    if (!io) return;
    try {
      const payload = JSON.parse(raw);

      switch (channel) {
        case CHANNELS.LIVE_UPDATE:
          // Broadcast to all clients watching this match
          io.to(ROOMS.liveMatch(payload.matchId)).emit("live_state", payload.liveState);
          // Also broadcast to global room (for live ticker)
          io.to(ROOMS.global).emit("live_ticker", {
            matchId:     payload.matchId,
            batting:     payload.liveState.battingTeam,
            bowling:     payload.liveState.bowlingTeam,
            score:       `${payload.liveState.runs}/${payload.liveState.wickets}`,
            overs:       payload.liveState.overs,
            lastBall:    payload.liveState.commentary?.[0]?.text ?? "",
          });
          break;

        case CHANNELS.MOMENTUM:
          // Broadcast to player rooms + any active battle rooms
          io.to(ROOMS.player(payload.playerId)).emit("momentum_update", payload);
          break;

        case CHANNELS.BATTLE_UPDATE:
          io.to(ROOMS.battle(payload.p1Id, payload.p2Id)).emit("battle_update", payload);
          break;

        case CHANNELS.AURA_UPDATE:
          io.to(ROOMS.player(payload.playerId)).emit("aura_update", payload);
          io.to(ROOMS.global).emit("aura_flash", payload); // global aura notification
          break;

        case CHANNELS.MATCH_STATE:
          io.to(ROOMS.liveMatch(payload.matchId)).emit("match_state", payload);
          break;

        default:
          break;
      }
    } catch (e: any) {
      logger.error("[socket] Message parse error", { channel, error: e.message });
    }
  });
}

// ── Helpers for other parts of the server ────────────────────────────────────

export function emitToRoom(room: string, event: string, data: unknown): void {
  io?.to(room).emit(event, data);
}

export function emitGlobal(event: string, data: unknown): void {
  io?.to(ROOMS.global).emit(event, data);
}

export function getSocketServer(): SocketServer | null {
  return io;
}

export { ROOMS };
