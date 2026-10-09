/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workflowTest from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const HAIKU = "anthropic/claude-haiku-5.5";

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  workflowTest.register(backend);
  return backend;
}

type Backend = ReturnType<typeof createTestBackend>;

async function loadGame(backend: Backend, gameId: Id<"games">) {
  return backend.run(async (ctx) => ({
    game: await ctx.db.get("games", gameId),
    players: await ctx.db
      .query("players")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(16),
  }));
}

async function freePlayDays(backend: Backend) {
  return backend.run(async (ctx) => ctx.db.query("freePlayUsage").take(8));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Free Play rooms", () => {
  test("stay off until the Claude API key is configured", async () => {
    const backend = createTestBackend();
    await expect(backend.query(api.freePlay.status, {})).resolves.toEqual({
      configured: false,
      gamesLeftToday: 50,
    });
    await expect(
      backend.action(api.rooms.create, {
        aiModelIds: [HAIKU],
        gameType: "SLOPLASH",
        hostName: "Host",
      }),
    ).rejects.toThrow("Free Play is not available right now");
    expect(await backend.run((ctx) => ctx.db.query("games").take(1))).toEqual([]);
  });

  test("creates a Haiku room without the host password and counts it", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    const backend = createTestBackend();

    const host = await backend.action(api.rooms.create, {
      aiModelIds: [HAIKU],
      gameType: "SLOPLASH",
      hostName: "Host",
    });

    const { game, players } = await loadGame(backend, host.gameId);
    expect(game?.freePlay).toBe(true);
    expect(game?.ttsMode).toBe("OFF");
    expect(
      players.map((player) => ({ type: player.type, modelId: player.modelId ?? null })),
    ).toEqual(
      expect.arrayContaining([
        { type: "HUMAN", modelId: null },
        { type: "AI", modelId: HAIKU },
      ]),
    );
    await expect(backend.query(api.freePlay.status, {})).resolves.toMatchObject({
      configured: true,
      gamesLeftToday: 49,
    });
  });

  test("pins every model and paid feature on the server", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    const backend = createTestBackend();
    const rejected: [FunctionArgs<typeof api.rooms.create>, string][] = [
      [
        { aiModelIds: ["openai/gpt-6.1-sol"], gameType: "SLOPLASH" },
        "Free Play AI players use Claude Haiku",
      ],
      [{ aiModelIds: [HAIKU, HAIKU], gameType: "SLOPLASH" }, "Free Play allows 1 AI player"],
      [{ gameType: "SLOPLASH", ttsMode: "ON" }, "The narrator needs the host password"],
      [{ gameType: "SLOPLASH", ttsVoice: "Puck" }, "The narrator needs the host password"],
      [
        {
          gameType: "MATCHSLOP",
          personaIdentity: "WOMAN",
          personaModelId: "openai/gpt-6.1-sol",
          seekerIdentity: "MAN",
        },
        "Free Play personas use Claude Haiku",
      ],
      [
        {
          aiModelIds: [HAIKU],
          gameType: "MATCHSLOP",
          personaIdentity: "WOMAN",
          personaModelId: HAIKU,
          seekerIdentity: "MAN",
        },
        "Free Play has no AI players in this mode",
      ],
      [
        {
          gameType: "QUIZSLOP",
          quizSlopContentSource: "AI",
          quizSlopGeneratorModelId: "openai/gpt-6.1-sol",
        },
        "Free Play question packs are written by Claude Haiku",
      ],
    ];

    for (const [args, message] of rejected) {
      await expect(backend.action(api.rooms.create, { hostName: "Host", ...args })).rejects.toThrow(
        message,
      );
    }
    expect(await backend.run((ctx) => ctx.db.query("games").take(1))).toEqual([]);
    expect(await freePlayDays(backend)).toEqual([]);
  });

  test("runs MatchSlop on a Haiku persona and verifies QuizSlop packs with Jev", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    const backend = createTestBackend();

    const matchSlop = await backend.action(api.rooms.create, {
      gameType: "MATCHSLOP",
      personaIdentity: "WOMAN",
      personaModelId: HAIKU,
      seekerIdentity: "MAN",
    });
    const quizSlop = await backend.action(api.rooms.create, {
      gameType: "QUIZSLOP",
      hostName: "Registrar",
      quizSlopContentSource: "AI",
      quizSlopGeneratorModelId: HAIKU,
    });

    const matchSlopGame = await loadGame(backend, matchSlop.gameId);
    expect(matchSlopGame.game).toMatchObject({ freePlay: true, personaModelId: HAIKU });
    expect(matchSlopGame.players.filter((player) => player.type === "AI")).toEqual([]);
    const quizSlopState = await backend.run(async (ctx) =>
      ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", quizSlop.gameId))
        .unique(),
    );
    expect(quizSlopState).toMatchObject({
      contentSource: "AI",
      generatorModelId: HAIKU,
      verifierModelId: "typesafe-ai/jev",
    });
  });

  test("stops at the daily cap without touching password rooms", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("FREE_PLAY_DAILY_GAME_LIMIT", "2");
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();

    for (const hostName of ["One", "Two"]) {
      await backend.action(api.rooms.create, { gameType: "SLOPLASH", hostName });
    }
    await expect(
      backend.action(api.rooms.create, { gameType: "SLOPLASH", hostName: "Three" }),
    ).rejects.toThrow("Free Play is out of games for today");
    await expect(backend.query(api.freePlay.status, {})).resolves.toMatchObject({
      gamesLeftToday: 0,
    });
    expect((await freePlayDays(backend)).map((day) => day.gamesCreated)).toEqual([2]);

    const paid = await backend.action(api.rooms.create, {
      aiModelIds: ["openai/gpt-6.1-sol"],
      gameType: "SLOPLASH",
      hostName: "Paid",
      hostSecret: "host-secret",
    });
    const { game } = await loadGame(backend, paid.gameId);
    expect(game?.freePlay).toBeUndefined();
    expect((await freePlayDays(backend)).map((day) => day.gamesCreated)).toEqual([2]);
  });

  test("keeps lobby AI additions inside the Free Play limits", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    const backend = createTestBackend();
    const sloplash = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Host",
    });

    await expect(
      backend.mutation(api.lobby.addAiPlayer, {
        capability: sloplash.capability,
        modelId: "google/gemini-3.5-flash-lite",
      }),
    ).rejects.toThrow("Free Play AI players use Claude Haiku");
    await backend.mutation(api.lobby.addAiPlayer, {
      capability: sloplash.capability,
      modelId: HAIKU,
    });
    const { players } = await loadGame(backend, sloplash.gameId);
    expect(
      players.filter((player) => player.type === "AI").map((player) => player.modelId),
    ).toEqual([HAIKU]);

    const matchSlop = await backend.action(api.rooms.create, {
      gameType: "MATCHSLOP",
      personaIdentity: "WOMAN",
      personaModelId: HAIKU,
      seekerIdentity: "MAN",
    });
    await expect(
      backend.mutation(api.lobby.addAiPlayer, {
        capability: matchSlop.capability,
        modelId: HAIKU,
      }),
    ).rejects.toThrow("Free Play has no AI players in this mode");
  });
});
