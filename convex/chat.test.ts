/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const createRoom = makeFunctionReference<
  "action",
  {
    aiModelIds?: string[];
    gameType: "AI_CHAT_SHOWDOWN" | "SLOPLASH";
    hostName: string;
    hostSecret: string;
  },
  {
    capability: string;
    gameId: Id<"games">;
    roomCode: string;
  }
>("rooms:create");

const sendChat = makeFunctionReference<
  "mutation",
  { capability: string; clientId?: string; content: string },
  {
    clientId: string | null;
    content: string;
    createdAt: string;
    id: Id<"chatMessages">;
    playerId: Id<"players">;
    replyToId: Id<"chatMessages"> | null;
  }
>("chat:send");

const joinRoom = makeFunctionReference<
  "action",
  { name: string; roomCode: string },
  { capability: string }
>("rooms:join");

const listChat = makeFunctionReference<
  "query",
  {
    capability: string;
    paginationOpts: { cursor: string | null; numItems: number };
  },
  {
    continueCursor: string;
    isDone: boolean;
    page: Array<{
      clientId: string | null;
      content: string;
      id: Id<"chatMessages">;
      playerId: Id<"players">;
    }>;
  }
>("chat:list");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  workpoolTest.register(backend, "aiGenerationWorkpool");
  return backend;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("reactive Convex chat", () => {
  test("stores an idempotent sanitized message and queues one durable AI reply job", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(createRoom, {
      aiModelIds: ["google/gemini-3-flash"],
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "WRITING" });
    });

    const first = await backend.mutation(sendChat, {
      capability: host.capability,
      clientId: "client-1",
      content: "  <b>Gemini</b>, hello room  ",
    });
    const retried = await backend.mutation(sendChat, {
      capability: host.capability,
      clientId: "client-1",
      content: "a retry must not create a second message",
    });

    expect(retried).toEqual(first);
    expect(first.content).toBe("Gemini, hello room");

    const persisted = await backend.run(async (ctx) => {
      const messages = await ctx.db
        .query("chatMessages")
        .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", host.gameId))
        .collect();
      const jobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_generationKey", (index) => index.eq("gameId", host.gameId))
        .collect();
      return { jobs, messages };
    });
    expect(persisted.messages).toHaveLength(1);
    expect(persisted.jobs).toEqual([
      expect.objectContaining({
        generationKey: `chat-reply:${first.id}`,
        kind: "CHAT_REPLY",
        responderId: expect.any(String),
        reservedUntil: expect.any(Number),
        status: "QUEUED",
      }),
    ]);

    const page = await backend.query(listChat, {
      capability: host.capability,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(page.page).toEqual([
      expect.objectContaining({
        clientId: "client-1",
        content: "Gemini, hello room",
        id: first.id,
      }),
    ]);
  });

  test("does not reserve Workpool work for nonmentions or an AI still on cooldown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(createRoom, {
      aiModelIds: ["google/gemini-3-flash"],
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "WRITING" });
    });

    await backend.mutation(sendChat, {
      capability: host.capability,
      content: "hello room",
    });
    await backend.mutation(sendChat, {
      capability: host.capability,
      content: "Gemini, first answer",
    });
    await backend.mutation(sendChat, {
      capability: host.capability,
      content: "Gemini, answer again immediately",
    });

    const duringCooldown = await backend.run(async (ctx) =>
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_kind_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("kind", "CHAT_REPLY"),
        )
        .take(8),
    );
    expect(duringCooldown).toHaveLength(1);

    vi.advanceTimersByTime(15_001);
    await backend.mutation(sendChat, {
      capability: host.capability,
      content: "Gemini, the cooldown is over",
    });
    const afterCooldown = await backend.run(async (ctx) =>
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_kind_and_status", (index) =>
          index.eq("gameId", host.gameId).eq("kind", "CHAT_REPLY"),
        )
        .take(8),
    );
    expect(afterCooldown).toHaveLength(2);
    expect([...new Set(afterCooldown.map((job) => job.responderId))]).toHaveLength(1);
  });

  test("enforces transactional per-player and per-room chat admission windows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(createRoom, {
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    const joined = await Promise.all(
      ["One", "Two", "Three", "Four"].map((name) =>
        backend.action(joinRoom, { name, roomCode: host.roomCode }),
      ),
    );
    const firstFourCapabilities = [
      host.capability,
      ...joined.slice(0, 3).map((room) => room.capability),
    ];
    for (const [playerIndex, capability] of firstFourCapabilities.entries()) {
      for (let messageIndex = 0; messageIndex < 10; messageIndex += 1) {
        await backend.mutation(sendChat, {
          capability,
          clientId: `${playerIndex}:${messageIndex}`,
          content: `message ${playerIndex}:${messageIndex}`,
        });
      }
    }

    await expect(
      backend.mutation(sendChat, {
        capability: host.capability,
        clientId: "0:9",
        content: "idempotent retries bypass admission",
      }),
    ).resolves.toMatchObject({ clientId: "0:9", content: "message 0:9" });

    await expect(
      backend.mutation(sendChat, {
        capability: host.capability,
        content: "host is individually rate limited",
      }),
    ).rejects.toThrow("Too many messages");
    await expect(
      backend.mutation(sendChat, {
        capability: joined[3]?.capability ?? "",
        content: "fresh player is still room limited",
      }),
    ).rejects.toThrow("Chat is moving too fast");

    vi.advanceTimersByTime(10_001);
    await expect(
      backend.mutation(sendChat, {
        capability: joined[3]?.capability ?? "",
        content: "window reopened",
      }),
    ).resolves.toMatchObject({ content: "window reopened" });
  });

  test("rejects non-chat rooms and closed rooms", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const sloplash = await backend.action(createRoom, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    await expect(
      backend.mutation(sendChat, {
        capability: sloplash.capability,
        content: "wrong room",
      }),
    ).rejects.toThrow("Chat not available");

    const chat = await backend.action(createRoom, {
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", chat.gameId, { status: "FINAL_RESULTS" });
    });
    await expect(
      backend.mutation(sendChat, {
        capability: chat.capability,
        content: "too late",
      }),
    ).rejects.toThrow("Chat is closed");
  });
});
