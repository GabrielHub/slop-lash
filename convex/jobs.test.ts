/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { aiWorkpools } from "./components";
import { enqueueJob, jobResult, type AiCallRow, type JobHandler } from "./jobs";
import schema from "./schema";

// Two fake job kinds, wired into the real job plumbing: a handler (via
// `getJobHandler`) and a runner (via the runner map in `jobRunner.ts`).
const fake = vi.hoisted(() => {
  const FAILED_CALL = "TEST_FAILED_CALL";
  const CRASH = "TEST_CRASH";
  return {
    FAILED_CALL,
    CRASH,
    applied: [] as unknown[],
    fellBack: [] as string[],
    runners: {} as Record<string, (input: unknown) => Promise<unknown>>,
    handler: undefined as unknown,
  };
});

vi.mock("./modes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./modes")>();
  return {
    ...actual,
    getJobHandler: (kind: string) =>
      kind === fake.FAILED_CALL || kind === fake.CRASH
        ? (fake.handler as JobHandler)
        : actual.getJobHandler(kind),
  };
});

vi.mock("./matchslop/runners", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./matchslop/runners")>();
  return {
    ...actual,
    matchslopRunners: {
      ...actual.matchslopRunners,
      [fake.FAILED_CALL]: (input: unknown) => fake.runners[fake.FAILED_CALL]!(input),
      [fake.CRASH]: (input: unknown) => fake.runners[fake.CRASH]!(input),
    },
  };
});

const modules = import.meta.glob("./**/*.ts");

const FAILED_CALL: AiCallRow = {
  task: "sloplash.ballots",
  promptVersion: 1,
  modelId: "anthropic/claude-haiku-5.5",
  ok: false,
  failReason: "timeout",
  finishReason: null,
  latencyMs: 20_000,
  attempts: 1,
  usage: {
    inputTokens: 1_000,
    outputTokens: 0,
    cacheReadTokens: 600,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    costUsd: 0.000_046,
    cachePriceKnown: true,
  },
  error: "timed out",
  createdAt: 1,
};

const handler: JobHandler<{ voter: string }, { ballots: string[] }> = {
  phaseBound: false,
  pool: "critical",
  prepare: async (_ctx, _game, job) => job.payload as { voter: string },
  apply: async (_ctx, _game, job, output) => {
    fake.applied.push({ kind: job.kind, output });
  },
  fallback: async (_ctx, _game, job) => {
    fake.fellBack.push(job.kind);
  },
};
fake.handler = handler;
fake.runners[fake.FAILED_CALL] = async () => jobResult({ ballots: [] }, [FAILED_CALL], "timeout");
fake.runners[fake.CRASH] = async () => {
  throw new Error("runner crashed");
};

function setup() {
  const t = convexTest(schema, modules);
  workpoolTest.register(t, "aiGenerationWorkpool");
  workpoolTest.register(t, "aiCriticalWorkpool");
  return t;
}

type Backend = ReturnType<typeof setup>;

async function lobbyGame(t: Backend): Promise<Id<"games">> {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("games", {
      roomCode: "JOBS",
      gameNumber: 1,
      gameType: "SLOPLASH",
      status: "LOBBY",
      phase: "LOBBY",
      step: 0,
      round: 0,
      totalRounds: 3,
      phaseGeneration: 1,
      phaseStartedAt: now,
      displayHost: false,
      freePlay: false,
      timersDisabled: true,
      ttsMode: "OFF",
      ttsVoice: "default",
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function enqueue(t: Backend, gameId: Id<"games">, kind: string) {
  await t.run(async (ctx) => {
    const game = await ctx.db.get("games", gameId);
    await enqueueJob(ctx, game!, kind, `${kind}:1`, { voter: "v1" });
  });
}

async function jobRows(t: Backend, gameId: Id<"games">) {
  return t.run(async (ctx) => ({
    jobs: await ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_key", (index) => index.eq("gameId", gameId))
      .collect(),
    calls: await ctx.db
      .query("aiCalls")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .collect(),
    usage: await ctx.db
      .query("gameModelUsage")
      .withIndex("by_gameId_and_modelId", (index) => index.eq("gameId", gameId))
      .collect(),
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  fake.applied.length = 0;
  fake.fellBack.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("AI job plumbing", () => {
  test("a runner's failReason ends the job FAILED after apply stores the fallback", async () => {
    const t = setup();
    const gameId = await lobbyGame(t);
    const critical = vi.spyOn(aiWorkpools.critical, "enqueueAction");
    const background = vi.spyOn(aiWorkpools.background, "enqueueAction");

    await enqueue(t, gameId, fake.FAILED_CALL);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // The handler's `pool: "critical"` routed it to the critical workpool.
    expect(critical).toHaveBeenCalledTimes(1);
    expect(background).not.toHaveBeenCalled();

    const { jobs, calls, usage } = await jobRows(t, gameId);
    expect(jobs).toHaveLength(1);
    const job = jobs[0]!;
    expect(job).toMatchObject({ status: "FAILED", failReason: "timeout" });
    expect(job.startedAt).toEqual(expect.any(Number));
    expect(job.latencyMs).toEqual(expect.any(Number));
    expect(fake.applied).toEqual([{ kind: fake.FAILED_CALL, output: { ballots: [] } }]);
    expect(fake.fellBack).toEqual([]);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ ...FAILED_CALL, gameId, jobId: job._id });
    // The failed call's billed tokens still count toward the game's spend.
    expect(usage).toEqual([
      expect.objectContaining({
        modelId: FAILED_CALL.modelId,
        inputTokens: 1_000,
        costUsd: 0.000_046,
      }),
    ]);
  });

  test("a runner that throws ends FAILED with action-error and gets the fallback", async () => {
    const t = setup();
    const gameId = await lobbyGame(t);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await enqueue(t, gameId, fake.CRASH);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { jobs, calls } = await jobRows(t, gameId);
    expect(jobs[0]).toMatchObject({ status: "FAILED", failReason: "action-error" });
    expect(jobs[0]!.error).toContain("runner crashed");
    expect(fake.applied).toEqual([]);
    expect(fake.fellBack).toEqual([fake.CRASH]);
    expect(calls).toEqual([]);
  });

  test("recordAiCalls stores calls made outside a job, without a jobId", async () => {
    const t = setup();
    const gameId = await lobbyGame(t);
    await t.mutation(internal.jobs.recordAiCalls, {
      gameId,
      calls: [
        { ...FAILED_CALL, task: "narrator.line", ok: true, failReason: null, finishReason: "stop" },
      ],
    });
    const { calls, usage } = await jobRows(t, gameId);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.jobId).toBeUndefined();
    expect(calls[0]).toMatchObject({ task: "narrator.line", ok: true });
    // Narrator spend is not player spend.
    expect(usage).toEqual([]);
  });
});
