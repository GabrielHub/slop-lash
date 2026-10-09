/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const HAIKU = "anthropic/claude-haiku-5.5";

function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  workpoolTest.register(t, "aiGenerationWorkpool");
  return t;
}

type Backend = ReturnType<typeof setup>;

async function games(t: Backend) {
  return t.run((ctx) => ctx.db.query("games").take(8));
}

async function freePlayDays(t: Backend) {
  return t.run((ctx) => ctx.db.query("freePlayUsage").take(8));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Free Play rooms", () => {
  test("stay off until the Claude API key is configured", async () => {
    const t = setup();
    await expect(t.query(api.freePlay.status, {})).resolves.toEqual({
      configured: false,
      gamesLeftToday: 50,
    });
    await expect(
      t.action(api.rooms.create, { aiModelIds: [HAIKU], gameType: "SLOPLASH", hostName: "Host" }),
    ).rejects.toThrow("Free Play is not available right now");
    expect(await games(t)).toEqual([]);
  });

  test("creates a Haiku room without the host password and counts it", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    const t = setup();
    const host = await t.action(api.rooms.create, {
      aiModelIds: [HAIKU],
      gameType: "SLOPLASH",
      hostName: "Host",
    });
    const view = await t.query(api.views.room, { capability: host.capability });
    expect(view.room).toMatchObject({ freePlay: true, ttsMode: "OFF" });
    expect(view.players.map((player) => [player.type, player.modelId])).toEqual([
      ["HUMAN", null],
      ["AI", HAIKU],
    ]);
    await expect(t.query(api.freePlay.status, {})).resolves.toMatchObject({
      configured: true,
      gamesLeftToday: 49,
    });
  });

  test("pins every model and paid feature on the server", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    const t = setup();
    const matchslop = (personaModelId: string) => ({
      matchslop: {
        seekerIdentity: "MAN" as const,
        personaIdentity: "WOMAN" as const,
        personaModelId,
      },
    });
    const rejected: [FunctionArgs<typeof api.rooms.create>, string][] = [
      [
        { aiModelIds: ["openai/gpt-6.1-sol"], gameType: "SLOPLASH" },
        "Free Play AI players use Claude Haiku",
      ],
      [{ aiModelIds: [HAIKU, HAIKU], gameType: "SLOPLASH" }, "Free Play allows 1 AI player"],
      [{ gameType: "SLOPLASH", ttsMode: "ON" }, "The narrator needs the host password"],
      [
        { gameType: "MATCHSLOP", settings: matchslop("openai/gpt-6.1-sol") },
        "Free Play personas use Claude Haiku",
      ],
      [
        { aiModelIds: [HAIKU], gameType: "MATCHSLOP", settings: matchslop(HAIKU) },
        "Free Play has no AI players in this mode",
      ],
    ];
    for (const [args, message] of rejected) {
      await expect(t.action(api.rooms.create, { hostName: "Host", ...args })).rejects.toThrow(
        message,
      );
    }
    expect(await games(t)).toEqual([]);
    expect(await freePlayDays(t)).toEqual([]);
  });

  test("stops at the daily cap without touching password rooms", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("FREE_PLAY_DAILY_GAME_LIMIT", "2");
    vi.stubEnv("HOST_SECRET", "host-secret");
    const t = setup();
    for (const hostName of ["One", "Two"]) {
      await t.action(api.rooms.create, { gameType: "SLOPLASH", hostName });
    }
    await expect(
      t.action(api.rooms.create, { gameType: "SLOPLASH", hostName: "Three" }),
    ).rejects.toThrow("Free Play is out of games for today");
    expect((await freePlayDays(t)).map((day) => day.gamesCreated)).toEqual([2]);

    const paid = await t.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Paid",
      hostSecret: "host-secret",
    });
    const view = await t.query(api.views.room, { capability: paid.capability });
    expect(view.room.freePlay).toBe(false);
    expect((await freePlayDays(t)).map((day) => day.gamesCreated)).toEqual([2]);
  });
});
