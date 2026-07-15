/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  return backend;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("room capabilities", () => {
  test("creates, joins, rejoins, and reads a room without trusting player IDs", async () => {
    vi.stubEnv("HOST_SECRET", "correct horse battery staple");
    const backend = createTestBackend();

    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "  <b>Host</b>  ",
      hostSecret: "correct horse battery staple",
    });

    expect(host.roomCode).toMatch(/^[A-Z2-9]{6}$/u);
    expect(host.playerName).toBe("Host");
    expect(host.role).toBe("HOST");

    const [sessionId, secret] = host.capability.split(".");
    const storedSession = await backend.run(async (ctx) => {
      const id = ctx.db.normalizeId("playerSessions", sessionId ?? "");
      return id ? ctx.db.get("playerSessions", id) : null;
    });
    expect(storedSession?.capabilityHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(storedSession?.capabilityHash).not.toBe(secret);

    const initialSummary = await backend.query(api.rooms.summary, {
      capability: host.capability,
    });
    expect(initialSummary.me).toMatchObject({
      isHost: true,
      playerId: host.playerId,
      role: "HOST",
    });
    expect(initialSummary.players.map((player) => player.name)).toEqual(["Host"]);

    const guest = await backend.action(api.rooms.join, {
      name: "Guest",
      roomCode: host.roomCode.toLowerCase(),
    });
    expect(guest.playerId).not.toBe(host.playerId);

    const guestSummary = await backend.query(api.rooms.summary, {
      capability: guest.capability,
    });
    expect(guestSummary.me.isHost).toBe(false);
    expect(guestSummary.players.map((player) => player.name)).toEqual(["Host", "Guest"]);
    expect(guestSummary.game.playerCount).toBe(2);

    await expect(
      backend.action(api.rooms.join, {
        name: "gUeSt",
        roomCode: host.roomCode,
      }),
    ).rejects.toThrow("That name is already taken");

    const rejoined = await backend.mutation(api.rooms.rejoin, {
      capability: guest.capability,
      roomCode: host.roomCode.toLowerCase(),
    });
    expect(rejoined).toMatchObject({
      capability: guest.capability,
      playerId: guest.playerId,
      role: "PLAYER",
    });

    await expect(
      backend.query(api.rooms.hostAuthority, {
        capability: guest.capability,
      }),
    ).rejects.toThrow("Host capability required");

    const hostAuthority = await backend.query(api.rooms.hostAuthority, {
      capability: host.capability,
    });
    expect(hostAuthority).toMatchObject({
      gameId: host.gameId,
      playerId: host.playerId,
      sessionId: host.sessionId,
    });

    const wrongCapability = `${host.sessionId}.${"x".repeat(43)}`;
    await expect(backend.query(api.rooms.summary, { capability: wrongCapability })).rejects.toThrow(
      "Invalid or expired room capability",
    );
  });

  test("rate-limits repeated join attempts against a valid room", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await expect(
        backend.action(api.rooms.join, { name: "Host", roomCode: host.roomCode }),
      ).rejects.toThrow("That name is already taken");
    }
    await expect(
      backend.action(api.rooms.join, { name: "Guest", roomCode: host.roomCode }),
    ).rejects.toThrow("Too many join attempts for this room");
    const saturated = await backend.run(async (ctx) =>
      ctx.db
        .query("roomJoinRateLimits")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique(),
    );
    expect(saturated?.attempts).toBe(12);
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "WRITING" });
    });
    await expect(
      backend.action(api.rooms.join, { name: "Guest", roomCode: host.roomCode }),
    ).rejects.toThrow("Game already in progress");
    const unchanged = await backend.run(async (ctx) =>
      ctx.db
        .query("roomJoinRateLimits")
        .withIndex("by_gameId", (index) => index.eq("gameId", host.gameId))
        .unique(),
    );
    expect(unchanged?.attempts).toBe(12);
  });

  test("rejects malformed room codes before indexed room lookup", async () => {
    const backend = createTestBackend();
    await expect(backend.action(api.rooms.join, { name: "Guest", roomCode: "A" })).rejects.toThrow(
      "Room code must be 6 characters",
    );
    await expect(
      backend.mutation(api.rooms.rejoin, {
        capability: "invalid",
        roomCode: "x".repeat(10_000),
      }),
    ).rejects.toThrow("Room code must be 6 characters");
  });

  test("gives a display-only host a host capability without inventing a player", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();

    const host = await backend.action(api.rooms.create, {
      gameType: "MATCHSLOP",
      hostName: "Should not become a player",
      hostParticipation: "PLAYER",
      hostSecret: "host-secret",
      personaModelId: "openai/gpt-5.4-mini",
      seekerIdentity: "OTHER",
      personaIdentity: "WOMAN",
    });

    expect(host).toMatchObject({
      playerId: null,
      playerName: null,
      playerType: null,
      role: "HOST",
    });
    const authority = await backend.query(api.rooms.hostAuthority, {
      capability: host.capability,
    });
    expect(authority.playerId).toBeNull();

    await expect(
      backend.mutation(api.presence.heartbeat, {
        capability: host.capability,
        interval: 10_000,
        sessionId: "5d63f4c1-9d3f-444c-920e-947b0665855e",
      }),
    ).resolves.toMatchObject({ sessionToken: expect.any(String) });

    await expect(
      backend.action(api.rooms.create, {
        gameType: "MATCHSLOP",
        hostSecret: "host-secret",
        personaModelId: "openai/gpt-5.4-mini",
      }),
    ).rejects.toThrow("MatchSlop requires seekerIdentity and personaIdentity");
  });

  test("derives Presence room and user IDs from the room capability", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });

    const presenceSession = await backend.mutation(api.presence.heartbeat, {
      capability: host.capability,
      interval: 10_000,
      sessionId: "db0ce2a2-b532-40f1-84ea-d3ac29950f8e",
    });
    const presence = await backend.query(api.presence.list, {
      capability: host.capability,
    });
    expect(presence).toEqual([expect.objectContaining({ online: true, userId: host.sessionId })]);
    await backend.run(async (ctx) => {
      const lease = await ctx.db
        .query("roomPresenceSessions")
        .withIndex("by_tabSessionId", (index) =>
          index.eq("tabSessionId", "db0ce2a2-b532-40f1-84ea-d3ac29950f8e"),
        )
        .unique();
      if (!lease) throw new Error("Expected presence lease");
      await ctx.db.patch("roomPresenceSessions", lease._id, { lastHeartbeatAt: 0 });
    });
    await expect(
      backend.mutation(api.presence.heartbeat, {
        capability: host.capability,
        interval: 10_000,
        sessionId: "db0ce2a2-b532-40f1-84ea-d3ac29950f8e",
      }),
    ).resolves.toMatchObject({ sessionToken: presenceSession.sessionToken });

    await backend.mutation(api.presence.disconnect, {
      sessionToken: presenceSession.sessionToken,
    });
    const leases = await backend.run(async (ctx) =>
      ctx.db
        .query("roomPresenceSessions")
        .withIndex("by_roomSessionId", (index) => index.eq("roomSessionId", host.sessionId))
        .take(8),
    );
    expect(leases).toEqual([]);
  });

  test("refreshes durable session activity coarsely instead of on every heartbeat", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    const initialSession = await backend.run(async (ctx) =>
      ctx.db.get("playerSessions", host.sessionId),
    );
    if (!initialSession) throw new Error("Expected room session");

    await backend.mutation(api.presence.heartbeat, {
      capability: host.capability,
      interval: 10_000,
      sessionId: "dc6396d5-f851-46c4-a534-87833142251a",
    });
    const afterFreshHeartbeat = await backend.run(async (ctx) =>
      ctx.db.get("playerSessions", host.sessionId),
    );
    expect(afterFreshHeartbeat?.lastSeenAt).toBe(initialSession.lastSeenAt);

    await backend.run(async (ctx) => {
      await ctx.db.patch("playerSessions", host.sessionId, { lastSeenAt: 0 });
    });
    await backend.mutation(api.presence.heartbeat, {
      capability: host.capability,
      interval: 10_000,
      sessionId: "dc6396d5-f851-46c4-a534-87833142251a",
    });
    const afterStaleHeartbeat = await backend.run(async (ctx) =>
      ctx.db.get("playerSessions", host.sessionId),
    );
    expect(afterStaleHeartbeat?.lastSeenAt).toBeGreaterThan(0);
  });

  test("validates heartbeat inputs and caps active tabs per capability", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });

    await expect(
      backend.mutation(api.presence.heartbeat, {
        capability: host.capability,
        interval: 1,
        sessionId: "not-a-uuid",
      }),
    ).rejects.toThrow("Invalid presence heartbeat interval");
    await expect(
      backend.mutation(api.presence.heartbeat, {
        capability: host.capability,
        interval: 10_000,
        sessionId: "not-a-uuid",
      }),
    ).rejects.toThrow("Invalid presence session ID");

    const sessionIds = [
      "4429024c-084a-49f6-b892-659f12348ae1",
      "77ab9ff0-bac4-4b1b-81f8-21d99142a2cc",
      "a61c9091-e4eb-4495-a918-cbd57dc7e744",
      "e48510cb-63ac-4214-87c9-2a404ceffb94",
    ];
    for (const sessionId of sessionIds) {
      await expect(
        backend.mutation(api.presence.heartbeat, {
          capability: host.capability,
          interval: 10_000,
          sessionId,
        }),
      ).resolves.toMatchObject({ sessionToken: expect.any(String) });
    }
    await expect(
      backend.mutation(api.presence.heartbeat, {
        capability: host.capability,
        interval: 10_000,
        sessionId: "274eb4fe-9272-4bd1-9058-9946586554ee",
      }),
    ).rejects.toThrow("Too many active presence sessions");
  });
});
