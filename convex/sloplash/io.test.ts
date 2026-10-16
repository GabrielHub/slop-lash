// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { setup, view, type Backend } from "../test.harness";
import {
  createRound,
  insertResponse,
  insertVote,
  loadAllRounds,
  loadCurrentRound,
} from "../rounds";
import { findGameByCode, insertPlayer } from "../roster";

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function createRoom(t: Backend) {
  const host = await t.action(api.rooms.create, {
    gameType: "SLOPLASH",
    hostSecret: "secret",
    hostName: "Host",
    timersDisabled: true,
  });
  const seats = [host];
  for (const name of ["Ana", "Bo", "Cy"]) {
    seats.push(await t.action(api.rooms.join, { roomCode: host.roomCode, name }));
  }
  return { host, seats };
}

async function recordQueries<T>(ctx: MutationCtx, run: () => Promise<T>) {
  const spy = vi.spyOn(ctx.db, "query");
  try {
    const result = await run();
    return { result, tables: spy.mock.calls.map(([table]) => table) };
  } finally {
    spy.mockRestore();
  }
}

describe("SlopLash read boundaries", () => {
  test("AI history and taglines preserve their facts without reading round votes", async () => {
    const t = setup();
    const { host } = await createRoom(t);
    await t.run(async (ctx) => {
      const game = (await findGameByCode(ctx, host.roomCode))!;
      const aiId = await insertPlayer(ctx, game._id, {
        type: "AI",
        name: "Robot",
        normalizedName: "robot",
        modelId: "openai/gpt-6.1-sol",
      });
      const roundId = await createRound(ctx, game._id, 1, [
        { text: "Past prompt", assigneeIds: [aiId, host.playerId!] },
      ]);
      const prompt = (await ctx.db
        .query("prompts")
        .withIndex("by_roundId", (q) => q.eq("roundId", roundId))
        .first())!;
      const responseId = await insertResponse(ctx, prompt, aiId, "Winning robot joke");
      await ctx.db.patch("responses", responseId, { pointsEarned: 100 });
      await insertResponse(ctx, prompt, host.playerId!, "Human joke");
      await insertVote(ctx, prompt, host.playerId!, responseId);
      await createRound(ctx, game._id, 2, [
        { text: "New prompt", assigneeIds: [aiId, host.playerId!] },
      ]);
      await ctx.db.patch("games", game._id, { round: 2, status: "PLAYING", phase: "WRITING" });
      const current = (await ctx.db.get("games", game._id))!;
      const jobId = await ctx.db.insert("generationJobs", {
        gameId: game._id,
        kind: "SLOPLASH_JOKES",
        key: "test",
        phaseGeneration: 0,
        phaseBound: true,
        payload: { playerId: aiId },
        status: "QUEUED",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const job = (await ctx.db.get("generationJobs", jobId))!;
      const { sloplashJobHandlers } = await import("./mode");
      const history = await recordQueries(ctx, () =>
        sloplashJobHandlers.SLOPLASH_JOKES.prepare(ctx, current, job),
      );
      expect(history.tables).not.toContain("votes");
      expect(history.result?.history).toEqual([
        { round: 1, prompt: "Past prompt", yourJoke: "Winning robot joke", won: true },
      ]);
      expect(history.result?.prompts.map((item) => item.text)).toEqual(["New prompt"]);

      const tagline = await recordQueries(ctx, () =>
        sloplashJobHandlers.SLOPLASH_TAGLINE.prepare(ctx, { ...current, phase: "FINAL" }, job),
      );
      expect(tagline.tables).not.toContain("votes");
      expect(tagline.result?.jokes).toEqual([
        { prompt: "Past prompt", text: "Winning robot joke" },
      ]);

      const full = await loadAllRounds(ctx, game._id);
      const lean = await recordQueries(ctx, () =>
        loadAllRounds(ctx, game._id, { includeVotes: false }),
      );
      expect(full[0]?.votes).toHaveLength(1);
      expect(lean.tables).not.toContain("votes");
      expect(lean.result).toEqual(full.map((bundle) => ({ ...bundle, votes: [] })));
    });
  });

  test("reveal and results completion checks do not load round data", async () => {
    const t = setup();
    const { host } = await createRoom(t);
    await t.mutation(api.engine.start, { capability: host.capability });
    await t.run(async (ctx) => {
      const game = (await findGameByCode(ctx, host.roomCode))!;
      const { sloplashMode } = await import("./mode");
      for (const phase of ["REVEAL", "ROUND_RESULTS"]) {
        const checked = await recordQueries(ctx, () =>
          sloplashMode.isComplete(ctx, { ...game, phase }, []),
        );
        expect(checked.result).toBe(false);
        expect(checked.tables).toEqual([]);
      }
      const done = await recordQueries(ctx, () =>
        sloplashMode.next(
          ctx,
          { ...game, phase: "ROUND_RESULTS", round: game.totalRounds },
          "host",
        ),
      );
      expect(done.result).toBe("FINISH");
      expect(done.tables).toEqual(["players"]);
    });
  });

  test("live reactions change the narrow feed without changing the full room view", async () => {
    const t = setup();
    const { host, seats } = await createRoom(t);
    await t.mutation(api.engine.start, { capability: host.capability });
    for (const seat of seats) {
      const { mode } = await view(t, seat.capability);
      if (mode.kind !== "SLOPLASH" || !mode.writing) throw new Error("not writing");
      for (const prompt of mode.writing.prompts) {
        await t.mutation(api.sloplash.play.submitResponse, {
          capability: seat.capability,
          promptId: prompt.id,
          text: "An answer",
        });
      }
    }
    const current = await view(t, host.capability);
    if (current.mode.kind !== "SLOPLASH") throw new Error("wrong mode");
    const promptId = current.mode.currentPromptId!;
    const prompt = current.mode.round!.prompts.find((item) => item.id === promptId)!;
    const voters = seats.filter((seat) => !prompt.assigneeIds.includes(seat.playerId!));
    await t.mutation(api.sloplash.play.castVote, {
      capability: voters[0]!.capability,
      promptId,
      responseId: prompt.answers[0]!.id,
    });
    const before = await view(t, host.capability);
    await t.mutation(api.sloplash.play.react, {
      capability: voters[0]!.capability,
      responseId: prompt.answers[0]!.id,
      emoji: "laugh",
    });
    expect(await view(t, host.capability)).toEqual(before);
    const args = {
      roomCode: host.roomCode,
      phaseGeneration: current.room.phaseGeneration,
      promptId,
    };
    const feed = await t.query(api.sloplash.reactions.live, {
      ...args,
      capability: voters[0]!.capability,
    });
    expect(feed).toEqual([{ id: expect.any(String), emoji: "laugh", mine: true }]);
    expect(await t.query(api.sloplash.reactions.live, args)).toEqual([{ ...feed[0], mine: false }]);
    expect(
      await t.query(api.sloplash.reactions.live, {
        ...args,
        phaseGeneration: args.phaseGeneration - 1,
      }),
    ).toEqual([]);
    await expect(
      t.query(api.sloplash.reactions.live, { ...args, capability: "bad-capability" }),
    ).rejects.toThrow();

    await t.run(async (ctx) => {
      const game = (await ctx.db.get("games", current.room.id))!;
      const { sloplashView } = await import("./view");
      const rendered = await recordQueries(ctx, () => sloplashView(ctx, game, host.playerId));
      expect(rendered.tables).not.toContain("reactions");
      const bundle = (await loadCurrentRound(ctx, game))!;
      expect(bundle.votes).toHaveLength(1);
    });

    await t.mutation(api.sloplash.play.castVote, {
      capability: voters[1]!.capability,
      promptId,
      responseId: prompt.answers[0]!.id,
    });
    expect(await t.query(api.sloplash.reactions.live, args)).toEqual([]);
    const revealed = await view(t, host.capability);
    if (revealed.mode.kind !== "SLOPLASH") throw new Error("wrong mode");
    expect(
      revealed.mode.round!.prompts.find((item) => item.id === promptId)!.answers[0]!.reactions,
    ).toEqual([{ emoji: "laugh", playerId: voters[0]!.playerId }]);
  });
});
