/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { FORGE_EXAMPLES } from "../../src/games/slopfight/ai/examples";
import { heartbeat, runFor, setup, view } from "../test.harness";

/**
 * The one test that runs the real forge path end to end: ports.ts and the
 * Forge workstream's wrapper are not mocked; only the language model is, as
 * sloplash.test.ts does. Haiku's stream fails with a provider error and the
 * Sonnet fallback streams a champion.
 */
const ai = vi.hoisted(() => ({ models: [] as string[] }));

vi.mock("../../src/lib/ai-gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/ai-gateway")>();
  const { MockLanguageModelV4: Mock } = await import("ai/test");
  const { APICallError, simulateReadableStream } = await import("ai");
  const { FORGE_EXAMPLES: examples } = await import("../../src/games/slopfight/ai/examples");
  return {
    ...actual,
    getLanguageModel: (modelId: string) =>
      new Mock({
        doStream: async () => {
          ai.models.push(modelId);
          if (modelId === "anthropic/claude-haiku-5.5") {
            throw new APICallError({
              message: "overloaded",
              url: "https://example.invalid",
              requestBodyValues: {},
              statusCode: 400,
              isRetryable: false,
            });
          }
          const text = JSON.stringify(examples[0]!.result);
          const third = Math.ceil(text.length / 3);
          return {
            stream: simulateReadableStream({
              // No delays: fake timers would hold them.
              initialDelayInMs: null,
              chunkDelayInMs: null,
              chunks: [
                { type: "stream-start" as const, warnings: [] },
                { type: "text-start" as const, id: "t" },
                ...[text.slice(0, third), text.slice(third, 2 * third), text.slice(2 * third)].map(
                  (delta) => ({ type: "text-delta" as const, id: "t", delta }),
                ),
                { type: "text-end" as const, id: "t" },
                {
                  type: "finish" as const,
                  usage: {
                    inputTokens: { total: 8_000, noCache: 1_000, cacheRead: 7_000, cacheWrite: 0 },
                    outputTokens: { total: 2_500, text: 1_500, reasoning: 1_000 },
                  },
                  finishReason: { unified: "stop" as const, raw: "stop" },
                },
              ],
            }),
          };
        },
      }),
  };
});

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  ai.models = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("a Haiku forge failure falls back to Sonnet; the champion lands and both calls are recorded", async () => {
  const t = setup();
  // Four humans: no house champions, so the only model calls are this forge's.
  const host = await t.action(api.rooms.create, {
    gameType: "SLOPFIGHT",
    hostSecret: "secret",
    hostName: "Host",
    timersDisabled: true,
  });
  const caps = [host.capability];
  for (const name of ["Ana", "Bo", "Cy"]) {
    caps.push((await t.action(api.rooms.join, { roomCode: host.roomCode, name })).capability);
  }
  await heartbeat(t, caps);
  await t.mutation(api.engine.start, { capability: host.capability });
  const gameId = (await view(t, host.capability)).room.id as Id<"games">;

  await t.mutation(api.slopfight.play.submitChampion, {
    capability: host.capability,
    kind: "DESCRIBE",
    text: "this is Gerald, a frog in a suit",
  });
  await runFor(t, 3_000);

  const mode = (await view(t, host.capability)).mode;
  if (mode?.kind !== "SLOPFIGHT") throw new Error("wrong mode");
  const mine = mode.fighters[0]!;
  expect(mine.status).toBe("READY");
  expect(mine.champion?.name).toBe(FORGE_EXAMPLES[0]!.result.champion!.name);
  expect(ai.models).toEqual(["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"]);

  const { calls, usage } = await t.run(async (ctx) => ({
    calls: await ctx.db
      .query("aiCalls")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(10),
    usage: await ctx.db
      .query("gameModelUsage")
      .withIndex("by_gameId_and_modelId", (index) => index.eq("gameId", gameId))
      .take(10),
  }));
  expect(calls.map((call) => [call.task, call.modelId, call.ok])).toEqual([
    ["slopfight.forge", "anthropic/claude-haiku-5.5", false],
    ["slopfight.forgeFallback", "anthropic/claude-sonnet-5.5", true],
  ]);
  expect(usage.find((row) => row.modelId === "anthropic/claude-sonnet-5.5")?.outputTokens).toBe(
    2_500,
  );
}, 30_000);
