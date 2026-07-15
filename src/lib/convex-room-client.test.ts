import { describe, expect, it } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import { persistRoomSessionResult, roomResultToSessionInput } from "./convex-room-client";
import { getConvexRoomSession, type RoomSessionStorage } from "./convex-room-session";

class MemoryStorage implements RoomSessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("Convex room client session mapping", () => {
  it("keeps a player-host capability usable for both player and host operations", () => {
    const input = roomResultToSessionInput({
      capability: "session.secret",
      gameId: "game" as Id<"games">,
      gameType: "SLOPLASH",
      playerId: "player" as Id<"players">,
      playerName: "Host",
      playerType: "HUMAN",
      role: "HOST",
      roomCode: "ABCD",
      sessionId: "session" as Id<"playerSessions">,
    });

    expect(input).toMatchObject({
      gameId: "game",
      hostCapability: "session.secret",
      playerCapability: "session.secret",
      playerId: "player",
    });
  });

  it("does not invent a player identity for a display-only host", () => {
    const input = roomResultToSessionInput({
      capability: "session.secret",
      gameId: "game" as Id<"games">,
      gameType: "MATCHSLOP",
      playerId: null,
      playerName: null,
      playerType: null,
      role: "HOST",
      roomCode: "ABCD",
      sessionId: "session" as Id<"playerSessions">,
    });

    expect(input).toMatchObject({
      hostCapability: "session.secret",
      playerCapability: null,
      playerId: null,
    });
  });

  it("keeps a joined player capability out of host authority", () => {
    const input = roomResultToSessionInput({
      capability: "session.secret",
      gameId: "game" as Id<"games">,
      gameType: "AI_CHAT_SHOWDOWN",
      playerId: "player" as Id<"players">,
      playerName: "Guest",
      playerType: "HUMAN",
      role: "PLAYER",
      roomCode: "ABCD",
      sessionId: "session" as Id<"playerSessions">,
    });

    expect(input).toMatchObject({
      hostCapability: null,
      playerCapability: "session.secret",
    });
  });

  it("preserves display-host authority when the same browser joins as a player", () => {
    const storage = new MemoryStorage();
    persistRoomSessionResult(
      {
        capability: "host.secret",
        gameId: "game" as Id<"games">,
        gameType: "MATCHSLOP",
        playerId: null,
        playerName: null,
        playerType: null,
        role: "HOST",
        roomCode: "ABC234",
        sessionId: "host-session" as Id<"playerSessions">,
      },
      storage,
    );
    persistRoomSessionResult(
      {
        capability: "player.secret",
        gameId: "game" as Id<"games">,
        gameType: "MATCHSLOP",
        playerId: "player" as Id<"players">,
        playerName: "Guest",
        playerType: "HUMAN",
        role: "PLAYER",
        roomCode: "ABC234",
        sessionId: "player-session" as Id<"playerSessions">,
      },
      storage,
    );

    expect(getConvexRoomSession("ABC234", storage)).toMatchObject({
      hostCapability: "host.secret",
      playerCapability: "player.secret",
      playerId: "player",
      playerName: "Guest",
    });
  });

  it("preserves player authority when a display-host link is opened afterward", () => {
    const storage = new MemoryStorage();
    persistRoomSessionResult(
      {
        capability: "player.secret",
        gameId: "game" as Id<"games">,
        gameType: "MATCHSLOP",
        playerId: "player" as Id<"players">,
        playerName: "Guest",
        playerType: "HUMAN",
        role: "PLAYER",
        roomCode: "ABC234",
        sessionId: "player-session" as Id<"playerSessions">,
      },
      storage,
    );
    persistRoomSessionResult(
      {
        capability: "host.secret",
        gameId: "game" as Id<"games">,
        gameType: "MATCHSLOP",
        playerId: null,
        playerName: null,
        playerType: null,
        role: "HOST",
        roomCode: "ABC234",
        sessionId: "host-session" as Id<"playerSessions">,
      },
      storage,
    );

    expect(getConvexRoomSession("ABC234", storage)).toMatchObject({
      hostCapability: "host.secret",
      playerCapability: "player.secret",
      playerId: "player",
      playerName: "Guest",
    });
  });

  it("preserves host authority when the same browser joins as a spectator", () => {
    const storage = new MemoryStorage();
    persistRoomSessionResult(
      {
        capability: "host.secret",
        gameId: "game" as Id<"games">,
        gameType: "SLOPLASH",
        playerId: null,
        playerName: null,
        playerType: null,
        role: "HOST",
        roomCode: "ABC234",
        sessionId: "host-session" as Id<"playerSessions">,
      },
      storage,
    );
    persistRoomSessionResult(
      {
        capability: "spectator.secret",
        gameId: "game" as Id<"games">,
        gameType: "SLOPLASH",
        playerId: "spectator" as Id<"players">,
        playerName: "Watcher",
        playerType: "SPECTATOR",
        role: "SPECTATOR",
        roomCode: "ABC234",
        sessionId: "spectator-session" as Id<"playerSessions">,
      },
      storage,
    );

    expect(getConvexRoomSession("ABC234", storage)).toMatchObject({
      hostCapability: "host.secret",
      playerCapability: "spectator.secret",
      playerId: "spectator",
      playerType: "SPECTATOR",
    });
  });

  it("does not merge authority from a stale room that reused the same code", () => {
    const storage = new MemoryStorage();
    persistRoomSessionResult(
      {
        capability: "old-host.secret",
        gameId: "old-game" as Id<"games">,
        gameType: "SLOPLASH",
        playerId: null,
        playerName: null,
        playerType: null,
        role: "HOST",
        roomCode: "ABC234",
        sessionId: "old-session" as Id<"playerSessions">,
      },
      storage,
    );
    persistRoomSessionResult(
      {
        capability: "new-player.secret",
        gameId: "new-game" as Id<"games">,
        gameType: "SLOPLASH",
        playerId: "new-player" as Id<"players">,
        playerName: "New player",
        playerType: "HUMAN",
        role: "PLAYER",
        roomCode: "ABC234",
        sessionId: "new-session" as Id<"playerSessions">,
      },
      storage,
    );

    expect(getConvexRoomSession("ABC234", storage)).toMatchObject({
      gameId: "new-game",
      hostCapability: null,
      playerCapability: "new-player.secret",
    });
  });
});
