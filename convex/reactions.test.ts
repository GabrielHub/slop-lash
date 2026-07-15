/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const createRoom = makeFunctionReference<
  "action",
  { gameType: "SLOPLASH"; hostName: string; hostSecret: string },
  { capability: string; gameId: Id<"games">; playerId: Id<"players"> }
>("rooms:create");

const toggleReaction = makeFunctionReference<
  "mutation",
  { capability: string; emoji: "laugh" | "fire"; responseId: Id<"responses"> },
  { added: boolean }
>("reactions:toggle");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  return backend;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Convex reactions", () => {
  test("toggles a current-round reaction using the capability identity", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(createRoom, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    const responseId = await backend.run(async (ctx) => {
      const roundId = await ctx.db.insert("rounds", {
        gameId: host.gameId,
        roundNumber: 1,
      });
      const promptId = await ctx.db.insert("prompts", {
        gameId: host.gameId,
        roundId,
        ordinal: 0,
        text: "Prompt",
      });
      const id = await ctx.db.insert("responses", {
        gameId: host.gameId,
        roundId,
        promptId,
        playerId: host.playerId,
        text: "Response",
        pointsEarned: 0,
        submittedAt: Date.now(),
      });
      await ctx.db.insert("responses", {
        gameId: host.gameId,
        roundId,
        promptId,
        playerId: host.playerId,
        text: "Second response",
        pointsEarned: 0,
        submittedAt: Date.now(),
      });
      await ctx.db.patch("games", host.gameId, {
        currentRound: 1,
        status: "VOTING",
      });
      return id;
    });

    await expect(
      backend.mutation(toggleReaction, {
        capability: host.capability,
        emoji: "laugh",
        responseId,
      }),
    ).resolves.toEqual({ added: true });
    await expect(
      backend.mutation(toggleReaction, {
        capability: host.capability,
        emoji: "laugh",
        responseId,
      }),
    ).resolves.toEqual({ added: false });

    const reactions = await backend.run((ctx) => ctx.db.query("reactions").collect());
    expect(reactions).toEqual([]);
  });

  test("rejects reactions to a future Slop-Lash voting prompt", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(createRoom, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    const prompts = await backend.run(async (ctx) => {
      const roundId = await ctx.db.insert("rounds", {
        gameId: host.gameId,
        roundNumber: 1,
      });
      const seeded = [];
      for (let ordinal = 0; ordinal < 2; ordinal += 1) {
        const promptId = await ctx.db.insert("prompts", {
          gameId: host.gameId,
          roundId,
          ordinal,
          text: `Prompt ${ordinal + 1}`,
        });
        const responseIds = [];
        for (let responseIndex = 0; responseIndex < 2; responseIndex += 1) {
          responseIds.push(
            await ctx.db.insert("responses", {
              gameId: host.gameId,
              roundId,
              promptId,
              playerId: host.playerId,
              text: `Response ${ordinal + 1}.${responseIndex + 1}`,
              pointsEarned: 0,
              submittedAt: Date.now(),
            }),
          );
        }
        seeded.push({ promptId, responseIds });
      }
      await ctx.db.patch("games", host.gameId, {
        currentRound: 1,
        status: "VOTING",
        votingPromptIndex: 0,
      });
      return seeded.toSorted((left, right) => left.promptId.localeCompare(right.promptId));
    });
    const currentResponseId = prompts[0]?.responseIds[0];
    const futureResponseId = prompts[1]?.responseIds[0];
    if (!currentResponseId || !futureResponseId) throw new Error("Expected two voting prompts");

    await expect(
      backend.mutation(toggleReaction, {
        capability: host.capability,
        emoji: "fire",
        responseId: futureResponseId,
      }),
    ).rejects.toThrow("current voting prompt");
    await expect(
      backend.mutation(toggleReaction, {
        capability: host.capability,
        emoji: "fire",
        responseId: currentResponseId,
      }),
    ).resolves.toEqual({ added: true });
  });

  test("rejects responses from another room", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const [left, right] = await Promise.all([
      backend.action(createRoom, {
        gameType: "SLOPLASH",
        hostName: "Left",
        hostSecret: "host-secret",
      }),
      backend.action(createRoom, {
        gameType: "SLOPLASH",
        hostName: "Right",
        hostSecret: "host-secret",
      }),
    ]);
    const responseId = await backend.run(async (ctx) => {
      const roundId = await ctx.db.insert("rounds", {
        gameId: right.gameId,
        roundNumber: 1,
      });
      const promptId = await ctx.db.insert("prompts", {
        gameId: right.gameId,
        roundId,
        ordinal: 0,
        text: "Prompt",
      });
      const id = await ctx.db.insert("responses", {
        gameId: right.gameId,
        roundId,
        promptId,
        playerId: right.playerId,
        text: "Response",
        pointsEarned: 0,
        submittedAt: Date.now(),
      });
      await ctx.db.patch("games", left.gameId, { currentRound: 1, status: "VOTING" });
      return id;
    });

    await expect(
      backend.mutation(toggleReaction, {
        capability: left.capability,
        emoji: "fire",
        responseId,
      }),
    ).rejects.toThrow("Response not found in this game");
  });
});
