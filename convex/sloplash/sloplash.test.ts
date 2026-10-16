/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { FORFEIT_MARKER } from "../../src/games/core/constants";
import { presentationOrder } from "../../src/games/sloplash/order";
import { setup, type Backend, view, heartbeat, drainJobs } from "../test.harness";

/**
 * Every model call goes to a mock that answers by call shape: the jokes call
 * (a `<prompts>` block), the ballots call (`<matchups>`) or the tagline
 * (`<context>`). Each test sets how they behave.
 */
type Reply = string | Error;
const ai = vi.hoisted(() => ({
  jokes: (_keys: string[]): Reply => "",
  ballots: (_keys: string[]): Reply => "",
  tagline: (): Reply => "",
  calls: [] as { kind: "jokes" | "ballots" | "tagline"; user: string }[],
}));

vi.mock("../../src/lib/ai-gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/ai-gateway")>();
  const { MockLanguageModelV4: Mock } = await import("ai/test");
  return {
    ...actual,
    getLanguageModel: () =>
      new Mock({
        doGenerate: async (options) => {
          const user = options.prompt
            .filter((message) => message.role === "user")
            .flatMap((message) => message.content)
            .map((part) => (part.type === "text" ? part.text : ""))
            .join("\n");
          const keys = (pattern: RegExp) => [...user.matchAll(pattern)].map((match) => match[1]!);
          const kind = user.includes("<prompts>")
            ? "jokes"
            : user.includes("<matchups>")
              ? "ballots"
              : "tagline";
          ai.calls.push({ kind, user });
          const next =
            kind === "jokes"
              ? ai.jokes(keys(/<prompt key="(P\d+)">/gu))
              : kind === "ballots"
                ? ai.ballots(keys(/<matchup key="(M\d+)">/gu))
                : ai.tagline();
          if (next instanceof Error) throw next;
          return {
            content: [{ type: "text" as const, text: next }],
            finishReason: { unified: "stop" as const, raw: "stop" },
            usage: {
              inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 5, text: 5, reasoning: 0 },
            },
            warnings: [],
          };
        },
      }),
  };
});

const okJokes = (keys: string[]) =>
  JSON.stringify({ answers: keys.map((key) => ({ prompt: key, text: `robot joke ${key}` })) });
const pickA = (keys: string[]) =>
  JSON.stringify({
    ballots: keys.map((key) => ({ matchup: key, pick: "A", reaction: "laugh" })),
  });

const AI_MODELS = ["openai/gpt-6.1-sol", "google/gemini-3.5-flash-lite"];

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  ai.jokes = okJokes;
  ai.ballots = pickA;
  ai.tagline = () => "Two rounds in and I haven't loaded my good jokes yet.";
  ai.calls = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function mode(t: Backend, capability: string) {
  const current = (await view(t, capability)).mode;
  if (current?.kind !== "SLOPLASH") throw new Error("wrong mode");
  return current;
}

async function room(t: Backend, capability: string) {
  return (await view(t, capability)).room;
}

/** Host, Ana and Bo, plus two AI seats unless told otherwise. */
async function sloplashRoom(t: Backend, options: { ai?: string[]; timers?: boolean } = {}) {
  const host = await t.action(api.rooms.create, {
    gameType: "SLOPLASH",
    hostSecret: "secret",
    hostName: "Host",
    timersDisabled: !options.timers,
    totalRounds: 1,
    aiModelIds: options.ai ?? AI_MODELS,
  });
  const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
  const bo = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Bo" });
  const humans = [host.capability, ana.capability, bo.capability];
  await heartbeat(t, humans);
  return { host, ana, bo, humans, gameId: (await room(t, host.capability)).id as Id<"games"> };
}

async function answerAll(t: Backend, capabilities: string[], text = (c: string) => `human ${c}`) {
  for (const capability of capabilities) {
    for (const prompt of (await mode(t, capability)).writing?.prompts ?? []) {
      await t.mutation(api.sloplash.play.submitResponse, {
        capability,
        promptId: prompt.id,
        text: text(capability.slice(-4)),
      });
    }
  }
}

async function players(t: Backend, gameId: Id<"games">) {
  return t.run((ctx) =>
    ctx.db
      .query("players")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(10),
  );
}

async function rows<
  T extends "votes" | "responses" | "sloplashBallots" | "generationJobs" | "prompts",
>(t: Backend, table: T) {
  return t.run((ctx) => ctx.db.query(table).take(100)) as Promise<Doc<T>[]>;
}

/** Votes every connected human who may vote on the matchup on screen, for its first answer. */
async function humansVote(t: Backend, humans: string[]) {
  const current = await mode(t, humans[0]!);
  const prompt = current.round!.prompts.find((p) => p.id === current.currentPromptId)!;
  for (const capability of humans) {
    const me = (await view(t, capability)).me!.playerId!;
    if (prompt.assigneeIds.includes(me)) continue;
    await t.mutation(api.sloplash.play.castVote, {
      capability,
      promptId: prompt.id,
      responseId: prompt.answers[0]!.id,
    });
  }
  return prompt;
}

type LivePrompt = NonNullable<Awaited<ReturnType<typeof mode>>["round"]>["prompts"][number];

/** Votes (humans, first answer) and advances until `done` holds, at most 12 steps. */
async function playUntil(
  t: Backend,
  host: string,
  humans: string[],
  done: (step: Awaited<ReturnType<typeof room>>, live: LivePrompt | undefined) => boolean,
) {
  for (let guard = 0; guard < 12; guard += 1) {
    const step = await room(t, host);
    const current = await mode(t, host);
    const live = current.round?.prompts.find((p) => p.id === current.currentPromptId);
    if (done(step, live)) return;
    await heartbeat(t, humans);
    if (step.phase === "VOTING") await humansVote(t, humans);
    else if (step.phase === "REVEAL" || step.phase === "WRITING") {
      await t.mutation(api.engine.advanceByHost, {
        capability: host,
        expectedPhaseGeneration: step.phaseGeneration,
      });
    } else return;
  }
}

describe("SlopLash AI jokes", () => {
  test("one call per AI seat answers all of its prompts, capped at 80 characters", async () => {
    const long =
      "My greatest weakness is that I am technically three raccoons in a trench coat, and also I bite";
    ai.jokes = (keys) =>
      JSON.stringify({ answers: keys.map((key) => ({ prompt: key, text: long })) });
    const t = setup();
    const { host, gameId } = await sloplashRoom(t);
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);

    expect(ai.calls.filter((call) => call.kind === "jokes")).toHaveLength(2);
    const seats = (await players(t, gameId)).filter((player) => player.type === "AI");
    const answers = (await rows(t, "responses")).filter((response) =>
      seats.some((seat) => seat._id === response.playerId),
    );
    expect(answers).toHaveLength(4);
    for (const answer of answers) {
      expect(answer.text.length).toBeLessThanOrEqual(80);
      expect(long.startsWith(answer.text)).toBe(true);
      expect(long.slice(answer.text.length)).toMatch(/^,? /u);
    }
    const jobs = (await rows(t, "generationJobs")).filter((job) => job.kind === "SLOPLASH_JOKES");
    expect(jobs.map((job) => job.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    const calls = await t.run((ctx) => ctx.db.query("aiCalls").take(20));
    expect(calls.filter((call) => call.task === "sloplash.jokes")).toHaveLength(2);
  });

  test("retries a failed AI joke call once, then forfeits into a walkover", async () => {
    ai.jokes = () => new Error("model unavailable");
    const t = setup();
    const { host, humans, gameId } = await sloplashRoom(t, { ai: [AI_MODELS[0]!] });
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);

    const job = (await rows(t, "generationJobs")).find((row) => row.kind === "SLOPLASH_JOKES")!;
    expect(job.status).toBe("FAILED");
    expect(job.failReason).toBe("provider-error");
    const calls = await t.run((ctx) => ctx.db.query("aiCalls").take(20));
    expect(calls.filter((call) => call.task === "sloplash.jokes" && !call.ok)).toHaveLength(2);
    const bot = (await players(t, gameId)).find((player) => player.type === "AI")!;
    const botAnswers = (await rows(t, "responses")).filter((r) => r.playerId === bot._id);
    expect(botAnswers.map((r) => r.text)).toEqual([FORFEIT_MARKER, FORFEIT_MARKER]);

    // The humans paired with the bot win by walkover, revealed before any vote.
    await heartbeat(t, humans);
    await answerAll(t, humans);
    expect(await room(t, host.capability)).toMatchObject({ phase: "REVEAL", step: 0 });
    const current = await mode(t, host.capability);
    const walkover = current.round!.prompts.find((p) => p.id === current.currentPromptId)!;
    expect(walkover.kind).toBe("walkover");
    expect(walkover.answers.find((a) => !a.forfeited)!.pointsEarned).toBe(100);
  });

  test("no retry with 30s or less of writing left", async () => {
    ai.jokes = () => new Error("model unavailable");
    const t = setup();
    const { host, gameId } = await sloplashRoom(t, { ai: [AI_MODELS[0]!] });
    await t.mutation(api.engine.start, { capability: host.capability });
    // Only 20s of writing left (and no tick, so the phase stays open for the job).
    await t.run((ctx) => ctx.db.patch("games", gameId, { phaseDeadline: Date.now() + 20_000 }));
    await drainJobs(t);
    const calls = await t.run((ctx) => ctx.db.query("aiCalls").take(20));
    expect(calls.filter((call) => call.task === "sloplash.jokes")).toHaveLength(1);
  });
});

describe("SlopLash AI ballots", () => {
  test("one call per AI voter when writing closes; staged out of view, cast per matchup", async () => {
    const t = setup();
    const { host, humans, gameId } = await sloplashRoom(t);
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    expect(ai.calls.filter((call) => call.kind === "ballots")).toHaveLength(0);
    await answerAll(t, humans);
    expect(await room(t, host.capability)).toMatchObject({ phase: "VOTING", step: 0 });

    await drainJobs(t);
    await heartbeat(t, humans);
    const ballotCalls = ai.calls.filter((call) => call.kind === "ballots");
    expect(ballotCalls).toHaveLength(2);
    // Five prompts, each AI wrote two: three matchups to vote on, never its own, no names.
    // Prompt text comes from a random bank ("ChatGPT", "Super Bowl"), so strip it first.
    const promptTexts = (await rows(t, "prompts")).map((prompt) => prompt.text);
    for (const call of ballotCalls) {
      expect(call.user.match(/<matchup key=/gu)).toHaveLength(3);
      const withoutPrompts = promptTexts.reduce(
        (user, text) => user.split(text).join(""),
        call.user,
      );
      expect(withoutPrompts).not.toMatch(/\b(?:GPT|Gemini|Ana|Bo|Host)\b/u);
    }

    const everyone = await players(t, gameId);
    const aiIds = everyone.filter((p) => p.type === "AI").map((p) => p._id as string);
    const current = await mode(t, host.capability);
    const live = current.round!.prompts.find((p) => p.id === current.currentPromptId)!;
    // The live matchup's AI ballots were cast on arrival; the rest wait off stage.
    const votes = await rows(t, "votes");
    const liveAiVotes = votes.filter(
      (v) => v.promptId === live.id && aiIds.includes(v.voterId as string),
    );
    const aiVoters = aiIds.filter((id) => !live.assigneeIds.includes(id as Id<"players">));
    expect(liveAiVotes).toHaveLength(aiVoters.length);
    const staged = await rows(t, "sloplashBallots");
    expect(staged.length).toBeGreaterThan(0);
    expect(staged.every((ballot) => ballot.promptId !== live.id)).toBe(true);
    // Views never see staged ballots, and AI reactions wait for the reveal.
    for (const prompt of current.round!.prompts.filter((p) => (p.order ?? -1) > 0)) {
      expect(prompt.votes).toEqual([]);
    }
    expect(live.liveReactions).toEqual([]);
    expect(
      await t.query(api.sloplash.reactions.live, {
        roomCode: host.roomCode,
        phaseGeneration: (await room(t, host.capability)).phaseGeneration,
        promptId: live.id,
        capability: host.capability,
      }),
    ).toEqual([]);

    await humansVote(t, humans);
    expect((await room(t, host.capability)).phase).toBe("REVEAL");
    const revealed = await mode(t, host.capability);
    const shown = revealed.round!.prompts.find((p) => p.id === live.id)!;
    expect(shown.answers.flatMap((a) => a.reactions).length).toBeGreaterThan(0);

    // A later matchup with AI voters: its staged ballots land 1–6s in, not before.
    const aiVotesOn = async (promptId: string) =>
      (await rows(t, "votes")).filter(
        (v) => v.promptId === promptId && aiIds.includes(v.voterId as string),
      );
    let checked = false;
    for (let guard = 0; guard < 8 && !checked; guard += 1) {
      const step = await room(t, host.capability);
      if (step.phase === "VOTING") {
        const now = await mode(t, host.capability);
        const next = now.round!.prompts.find((p) => p.id === now.currentPromptId)!;
        const stagedHere = (await rows(t, "sloplashBallots")).filter((b) => b.promptId === next.id);
        if (stagedHere.length > 0) {
          expect(await aiVotesOn(next.id)).toHaveLength(0);
          vi.advanceTimersByTime(6_001);
          await t.finishInProgressScheduledFunctions();
          const landed = await aiVotesOn(next.id);
          expect(landed).toHaveLength(stagedHere.length);
          expect(landed.every((vote) => vote.responseId !== undefined && !vote.timedOut)).toBe(
            true,
          );
          expect((await rows(t, "sloplashBallots")).some((b) => b.promptId === next.id)).toBe(
            false,
          );
          checked = true;
          break;
        }
        await heartbeat(t, humans);
        await humansVote(t, humans);
        continue;
      }
      if (step.phase !== "REVEAL") break;
      await t.mutation(api.engine.advanceByHost, {
        capability: host.capability,
        expectedPhaseGeneration: step.phaseGeneration,
      });
    }
    expect(checked).toBe(true);
  });

  test("an early close counts staged ballots as cast", async () => {
    const t = setup();
    const { host, humans, gameId } = await sloplashRoom(t);
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    await answerAll(t, humans);
    await drainJobs(t);
    await heartbeat(t, humans);
    await humansVote(t, humans);
    const reveal = await room(t, host.capability);
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: reveal.phaseGeneration,
    });
    // Everyone human votes before the AI ballots land: the vote closes at once.
    const prompt = await humansVote(t, humans);
    expect((await room(t, host.capability)).phase).toBe("REVEAL");
    const aiIds = (await players(t, gameId)).filter((p) => p.type === "AI").map((p) => p._id);
    const aiVotes = (await rows(t, "votes")).filter(
      (v) => v.promptId === prompt.id && aiIds.includes(v.voterId),
    );
    const voters = aiIds.filter((id) => !prompt.assigneeIds.includes(id));
    expect(aiVotes).toHaveLength(voters.length);
    expect(aiVotes.every((vote) => vote.responseId !== undefined)).toBe(true);
  });

  test("a failed AI ballot call abstains without timing out", async () => {
    ai.ballots = () => "this is not json";
    const t = setup();
    const { host, humans, gameId } = await sloplashRoom(t);
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    await answerAll(t, humans);
    await drainJobs(t);
    await heartbeat(t, humans);
    const jobs = (await rows(t, "generationJobs")).filter((j) => j.kind === "SLOPLASH_BALLOTS");
    expect(jobs.map((job) => [job.status, job.failReason])).toEqual([
      ["FAILED", "invalid-output"],
      ["FAILED", "invalid-output"],
    ]);
    // One retry each, then nothing staged.
    expect(ai.calls.filter((call) => call.kind === "ballots")).toHaveLength(4);
    expect(await rows(t, "sloplashBallots")).toEqual([]);

    // The vote doesn't wait on a failed AI, and the AI abstains (not a timeout).
    const prompt = await humansVote(t, humans);
    expect((await room(t, host.capability)).phase).toBe("REVEAL");
    const aiIds = (await players(t, gameId)).filter((p) => p.type === "AI").map((p) => p._id);
    const aiVotes = (await rows(t, "votes")).filter(
      (v) => v.promptId === prompt.id && aiIds.includes(v.voterId),
    );
    expect(aiVotes.length).toBeGreaterThan(0);
    expect(aiVotes.every((v) => v.responseId === undefined && !v.timedOut)).toBe(true);
  });

  test("a late ballot is cast on arrival for a live matchup and dropped for a past one", async () => {
    ai.ballots = () => new Error("held back");
    const t = setup();
    const { host, humans, gameId } = await sloplashRoom(t, { ai: [AI_MODELS[0]!] });
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    await answerAll(t, humans);
    await drainJobs(t);
    await heartbeat(t, humans);
    // Deterministic whatever the pairing: the past matchup is the first one the bot
    // may vote on, the live one is the second. Play up to the second one's vote.
    const bot = (await players(t, gameId)).find((p) => p.type === "AI")!;
    const plan = (await mode(t, host.capability))
      .round!.prompts.filter((p) => p.kind === "vote" && !p.assigneeIds.includes(bot._id))
      .toSorted((a, b) => a.order! - b.order!);
    expect(plan.length).toBeGreaterThanOrEqual(2);
    const [pastStep, liveStep] = [plan[0]!.order!, plan[1]!.order!];
    await playUntil(
      t,
      host.capability,
      humans,
      (step) => step.phase === "VOTING" && step.step === liveStep,
    );
    expect(await room(t, host.capability)).toMatchObject({ phase: "VOTING", step: liveStep });

    // Imported here: `mode` loads through `modes`, which must initialise first.
    const { sloplashJobHandlers } = await import("./mode");
    await t.run(async (ctx) => {
      const game = (await ctx.db.get("games", gameId))!;
      const prompts = await ctx.db
        .query("prompts")
        .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
        .take(10);
      const responses = await ctx.db.query("responses").take(20);
      const job = (await ctx.db.query("generationJobs").take(20)).find(
        (row) => row.kind === "SLOPLASH_BALLOTS",
      )!;
      // Ballots for every matchup the bot may vote on, as if they arrived just now.
      const ballots = prompts
        .filter((prompt) => !prompt.assigneeIds.includes(bot._id))
        .map((prompt) => ({
          promptId: prompt._id,
          responseId: responses.find((r) => r.promptId === prompt._id)!._id,
          reaction: null,
        }));
      await sloplashJobHandlers.SLOPLASH_BALLOTS.apply(ctx, game, job, { ballots });
    });

    const order = (await mode(t, host.capability)).round!.prompts;
    const at = (step: number) => order.find((p) => p.order === step)!;
    const votes = await rows(t, "votes");
    const staged = await rows(t, "sloplashBallots");
    const botVote = (promptId: string) =>
      votes.find((v) => v.promptId === promptId && v.voterId === bot._id);
    // The past matchup closed with the bot abstaining; the late ballot changed nothing.
    expect(botVote(at(pastStep).id)).toBeDefined();
    expect(botVote(at(pastStep).id)!.responseId).toBeUndefined();
    // The live matchup: cast at once. Later ones wait on stage.
    expect(botVote(at(liveStep).id)?.responseId).toBeDefined();
    for (const prompt of order.filter(
      (p) => (p.order ?? 0) > liveStep && !p.assigneeIds.includes(bot._id),
    )) {
      expect(staged.some((ballot) => ballot.promptId === prompt.id)).toBe(true);
    }
    expect(staged.some((ballot) => ballot.promptId === at(pastStep).id)).toBe(false);
    expect(staged.some((ballot) => ballot.promptId === at(liveStep).id)).toBe(false);
  });

  test("a staged ballot scheduled for an earlier phase is ignored", async () => {
    ai.ballots = () => new Error("held back");
    const t = setup();
    const { host, humans, gameId } = await sloplashRoom(t, { ai: [AI_MODELS[0]!] });
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    await answerAll(t, humans);
    await drainJobs(t);
    const bot = (await players(t, gameId)).find((p) => p.type === "AI")!;
    // Walk to a matchup the bot votes on.
    await playUntil(
      t,
      host.capability,
      humans,
      (step, live) =>
        step.phase === "VOTING" && live !== undefined && !live.assigneeIds.includes(bot._id),
    );
    const step = await room(t, host.capability);
    expect(step.phase).toBe("VOTING");
    const current = await mode(t, host.capability);
    const live = current.round!.prompts.find((p) => p.id === current.currentPromptId)!;
    const ballotId = await t.run(async (ctx) => {
      const round = (await ctx.db.query("rounds").take(5))[0]!;
      return ctx.db.insert("sloplashBallots", {
        gameId,
        roundId: round._id,
        promptId: live.id,
        voterId: bot._id,
        responseId: live.answers[0]!.id,
        createdAt: Date.now(),
      });
    });
    const botVotes = async () =>
      (await rows(t, "votes")).filter((v) => v.promptId === live.id && v.voterId === bot._id);

    await t.mutation(internal.sloplash.play.castStagedBallot, {
      ballotId,
      phaseGeneration: step.phaseGeneration - 1,
    });
    expect(await botVotes()).toEqual([]);
    expect((await rows(t, "sloplashBallots")).map((b) => b._id)).toEqual([ballotId]);

    await t.mutation(internal.sloplash.play.castStagedBallot, {
      ballotId,
      phaseGeneration: step.phaseGeneration,
    });
    expect((await botVotes()).map((v) => v.responseId)).toEqual([live.answers[0]!.id]);
    expect(await rows(t, "sloplashBallots")).toEqual([]);
  });
});

describe("SlopLash secrets", () => {
  test("live voting hides authors, other voters' picks and points; answers are shuffled", async () => {
    const t = setup();
    const { host, humans } = await sloplashRoom(t);
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    await answerAll(t, humans);
    await drainJobs(t);
    await heartbeat(t, humans);
    expect(await room(t, host.capability)).toMatchObject({ phase: "VOTING", step: 0 });

    const seat = new Map<string, Id<"players">>();
    for (const capability of humans) {
      seat.set(capability, (await view(t, capability)).me!.playerId! as Id<"players">);
    }
    const first = await mode(t, host.capability);
    const live = first.round!.prompts.find((p) => p.id === first.currentPromptId)!;
    const outsiders = humans.filter((c) => !live.assigneeIds.includes(seat.get(c)!));
    const author = humans.find((c) => live.assigneeIds.includes(seat.get(c)!));
    expect(outsiders.length).toBeGreaterThan(0);
    const voter = outsiders[0]!;
    await t.mutation(api.sloplash.play.castVote, {
      capability: voter,
      promptId: live.id,
      responseId: live.answers[1]!.id,
    });
    // The AI ballots for the live matchup are already in, too.
    const allVotes = (await rows(t, "votes")).filter((v) => v.promptId === live.id);
    expect(allVotes.some((v) => v.responseId !== undefined && v.voterId !== seat.get(voter))).toBe(
      true,
    );

    const seen = async (capability: string) =>
      (await mode(t, capability)).round!.prompts.find((p) => p.id === live.id)!;
    for (const capability of humans) {
      const prompt = await seen(capability);
      const me = seat.get(capability)!;
      expect(prompt.revealed).toBe(false);
      for (const answer of prompt.answers) {
        expect(answer.pointsEarned).toBe(0);
        expect(answer.reactions).toEqual([]);
        // Only your own answer carries your name.
        if (answer.playerId !== null) expect(answer.playerId).toBe(me);
      }
      for (const vote of prompt.votes) {
        if (vote.voterId !== me) expect(vote.responseId).toBeNull();
      }
    }
    const mine = (await seen(voter)).votes.find((v) => v.voterId === seat.get(voter))!;
    expect(mine.responseId).toBe(live.answers[1]!.id);
    if (author) {
      const named = (await seen(author)).answers.filter((a) => a.playerId !== null);
      expect(named).toHaveLength(1);
    }

    // Shown in the stable per-prompt shuffle, not creation order.
    const stored = (await rows(t, "responses")).filter((r) => r.promptId === live.id);
    expect(live.answers.map((a) => a.id)).toEqual(
      presentationOrder(live.id, stored).map((r) => r._id),
    );
  });
});

describe("SlopLash ending early", () => {
  test("ending mid-vote casts the live matchup's staged ballots and abstains the rest", async () => {
    const t = setup();
    const { host, humans, gameId } = await sloplashRoom(t);
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    await answerAll(t, humans);
    await drainJobs(t);
    await heartbeat(t, humans);
    // Move to a later matchup with staged AI ballots still waiting to land.
    await playUntil(
      t,
      host.capability,
      humans,
      (step) => step.phase === "VOTING" && step.step >= 1,
    );
    const current = await mode(t, host.capability);
    const live = current.round!.prompts.find((p) => p.id === current.currentPromptId)!;
    const stagedLive = (await rows(t, "sloplashBallots")).filter((b) => b.promptId === live.id);
    const laterIds = current
      .round!.prompts.filter((p) => p.kind === "vote" && p.order! > live.order!)
      .map((p) => p.id as string);
    expect(stagedLive.length + laterIds.length).toBeGreaterThan(0);

    await t.mutation(api.engine.end, { capability: host.capability });
    await drainJobs(t);

    const votes = await rows(t, "votes");
    const aiIds = (await players(t, gameId)).filter((p) => p.type === "AI").map((p) => p._id);
    for (const ballot of stagedLive) {
      const vote = votes.find((v) => v.promptId === live.id && v.voterId === ballot.voterId)!;
      expect(vote.responseId).toBe(ballot.responseId);
    }
    for (const vote of votes.filter((v) => laterIds.includes(v.promptId))) {
      // Never shown: nobody's ballot counts, AI or human.
      expect(vote.responseId).toBeUndefined();
      expect(vote.timedOut).toBe(!aiIds.includes(vote.voterId));
    }
    const responses = await rows(t, "responses");
    for (const response of responses.filter((r) => laterIds.includes(r.promptId))) {
      expect(response.pointsEarned).toBe(0);
    }
    const final = await view(t, host.capability);
    expect(final.room.status).toBe("FINISHED");
    expect(final.players.reduce((sum, p) => sum + p.score, 0)).toBe(
      responses.reduce((sum, r) => sum + r.pointsEarned, 0),
    );
  });

  test("ending mid-writing forfeits the blanks and pays the walkovers", async () => {
    ai.jokes = () => new Error("model unavailable");
    const t = setup();
    const { host, gameId } = await sloplashRoom(t, { ai: [AI_MODELS[0]!] });
    await t.mutation(api.engine.start, { capability: host.capability });
    // Only the host answers; nobody else writes, and the AI is still on its first try.
    await answerAll(t, [host.capability]);
    await t.mutation(api.engine.end, { capability: host.capability });
    await drainJobs(t);

    const final = await view(t, host.capability);
    expect(final.room.status).toBe("FINISHED");
    const prompts = await t.run((ctx) =>
      ctx.db
        .query("prompts")
        .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
        .take(10),
    );
    const responses = await rows(t, "responses");
    for (const prompt of prompts) {
      // Every seat has a row: the answer, or a forfeit.
      const here = responses.filter((r) => r.promptId === prompt._id);
      expect(here.map((r) => r.playerId).toSorted()).toEqual([...prompt.assigneeIds].toSorted());
      const present = here.filter((r) => r.text !== FORFEIT_MARKER);
      // A one-sided matchup pays the walkover; nothing else was voted on.
      for (const response of here) {
        expect(response.pointsEarned).toBe(
          present.length === 1 && response.text !== FORFEIT_MARKER ? 100 : 0,
        );
      }
    }
    const hostSeat = (await view(t, host.capability)).me!.playerId!;
    expect(final.players.find((p) => p.id === hostSeat)!.score).toBeGreaterThan(0);
  });
});

describe("SlopLash tagline paths", () => {
  test("a failing tagline model leaves no row", async () => {
    ai.tagline = () => new Error("tagline model down");
    const t = setup();
    const { host, humans, gameId } = await sloplashRoom(t, { ai: [AI_MODELS[0]!] });
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    await answerAll(t, humans);
    await drainJobs(t);
    const bot = (await players(t, gameId)).find((p) => p.type === "AI")!;
    await t.run((ctx) => ctx.db.patch("players", bot._id, { score: 10_000 }));
    await t.mutation(api.engine.end, { capability: host.capability });
    await drainJobs(t);
    expect((await mode(t, host.capability)).tagline).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("winnerTaglines").take(5))).toEqual([]);
    const job = (await rows(t, "generationJobs")).find((row) => row.kind === "SLOPLASH_TAGLINE")!;
    expect(job.status).toBe("FAILED");
    expect(ai.calls.filter((call) => call.kind === "tagline").length).toBeGreaterThan(0);
  });

  test("the leading AI gets a line on the round results screen", async () => {
    const t = setup();
    const { host, humans, gameId } = await sloplashRoom(t, { ai: [AI_MODELS[0]!] });
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    await answerAll(t, humans);
    await drainJobs(t);
    const bot = (await players(t, gameId)).find((p) => p.type === "AI")!;
    await t.run((ctx) => ctx.db.patch("players", bot._id, { score: 10_000 }));
    await playUntil(t, host.capability, humans, (step) => step.phase === "ROUND_RESULTS");
    expect((await room(t, host.capability)).phase).toBe("ROUND_RESULTS");
    await drainJobs(t);
    const tagline = (await mode(t, host.capability)).tagline!;
    expect(tagline.playerId).toBe(bot._id);
    expect(tagline.text).toBe("Two rounds in and I haven't loaded my good jokes yet.");
  });
});

describe("SlopLash tagline", () => {
  async function toResults(t: Backend) {
    const { host, humans, gameId } = await sloplashRoom(t, { ai: [AI_MODELS[0]!] });
    await t.mutation(api.engine.start, { capability: host.capability });
    await drainJobs(t);
    await heartbeat(t, humans);
    await answerAll(t, humans);
    await drainJobs(t);
    const bot = (await players(t, gameId)).find((p) => p.type === "AI")!;
    await t.run((ctx) => ctx.db.patch("players", bot._id, { score: 10_000 }));
    await t.mutation(api.engine.end, { capability: host.capability });
    await drainJobs(t);
    return { host, gameId };
  }

  test("the leading AI's line is capped at 100 characters", async () => {
    ai.tagline = () => `"${"Ana, your jokes have the shelf life of milk. ".repeat(4)}"`;
    const t = setup();
    const { host } = await toResults(t);
    const tagline = (await mode(t, host.capability)).tagline!;
    expect(tagline.text!.length).toBeLessThanOrEqual(100);
    expect(tagline.text!.startsWith("Ana, your jokes")).toBe(true);
  });

  test("an empty tagline leaves no row", async () => {
    ai.tagline = () => "   ";
    const t = setup();
    const { host } = await toResults(t);
    expect((await mode(t, host.capability)).tagline).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("winnerTaglines").take(5))).toEqual([]);
    const job = (await rows(t, "generationJobs")).find((row) => row.kind === "SLOPLASH_TAGLINE")!;
    expect(job.status).toBe("FAILED");
  });
});

describe("SlopLash rules", () => {
  test("a one-sided matchup is revealed as a walkover before voting", async () => {
    const t = setup();
    const { host, ana, bo, humans } = await sloplashRoom(t, { ai: [] });
    await t.mutation(api.engine.start, { capability: host.capability });
    // Bo writes nothing: both of Bo's matchups are walkovers.
    await answerAll(t, [host.capability, ana.capability]);
    await heartbeat(t, humans);
    const writing = await room(t, host.capability);
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: writing.phaseGeneration,
    });
    expect(await room(t, host.capability)).toMatchObject({ phase: "REVEAL", step: 0 });
    const first = await mode(t, host.capability);
    const walkover = first.round!.prompts.find((p) => p.id === first.currentPromptId)!;
    expect(walkover).toMatchObject({ kind: "walkover", order: 0, revealed: true });
    expect(walkover.answers.find((a) => !a.forfeited)!.pointsEarned).toBe(100);
    // Hidden future matchups keep only their kind, order and assignees.
    const hidden = first.round!.prompts.find((p) => p.order === 2)!;
    expect(hidden).toMatchObject({ kind: "vote", text: "", answers: [], votes: [] });

    await expect(
      t.mutation(api.sloplash.play.castVote, {
        capability: bo.capability,
        promptId: walkover.id,
        responseId: walkover.answers[0]!.id,
      }),
    ).rejects.toThrow("Voting is closed");

    for (const step of [1, 2]) {
      const current = await room(t, host.capability);
      await t.mutation(api.engine.advanceByHost, {
        capability: host.capability,
        expectedPhaseGeneration: current.phaseGeneration,
      });
      expect(await room(t, host.capability)).toMatchObject({
        phase: step === 1 ? "REVEAL" : "VOTING",
        step,
      });
    }
    const voting = await mode(t, host.capability);
    expect(voting.matchupCount).toBe(3);
    await expect(
      t.mutation(api.sloplash.play.castVote, {
        capability: bo.capability,
        promptId: walkover.id,
        responseId: walkover.answers[0]!.id,
      }),
    ).rejects.toThrow("Voting moved on to another matchup");
  });

  test("castVote rejects a missing choice", async () => {
    const t = setup();
    const { host } = await sloplashRoom(t, { ai: [] });
    await expect(
      t.mutation(api.sloplash.play.castVote, {
        capability: host.capability,
        promptId: "x" as Id<"prompts">,
        responseId: null as unknown as Id<"responses">,
      }),
    ).rejects.toThrow();
  });

  test("react only during voting, on your own pick, never your own matchup", async () => {
    const t = setup();
    const { host, humans: three } = await sloplashRoom(t, { ai: [] });
    const cy = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Cy" });
    const humans = [...three, cy.capability];
    await heartbeat(t, humans);
    await t.mutation(api.engine.start, { capability: host.capability });
    await answerAll(t, humans);
    const current = await mode(t, host.capability);
    const prompt = current.round!.prompts.find((p) => p.id === current.currentPromptId)!;
    const seatOf = new Map<string, string>();
    for (const capability of humans) {
      seatOf.set(capability, (await view(t, capability)).me!.playerId!);
    }
    const mine = (c: string) => prompt.assigneeIds.includes(seatOf.get(c) as Id<"players">);
    const [voter, other] = humans.filter((c) => !mine(c));
    const author = humans.find(mine)!;
    const [first, second] = prompt.answers;
    const react = (capability: string, responseId: Id<"responses">, emoji = "laugh") =>
      t.mutation(api.sloplash.play.react, { capability, responseId, emoji });

    await expect(react(voter!, first!.id)).rejects.toThrow("Vote first");
    await t.mutation(api.sloplash.play.castVote, {
      capability: voter!,
      promptId: prompt.id,
      responseId: first!.id,
    });
    await expect(react(voter!, second!.id)).rejects.toThrow("Vote first");
    await expect(react(author, first!.id)).rejects.toThrow("You can't react to your own matchup");
    await expect(react(voter!, first!.id, "clown")).rejects.toThrow("Unknown reaction");
    await react(voter!, first!.id);
    await react(voter!, first!.id);
    await react(voter!, first!.id, "fire");

    // Live and anonymous: everyone sees the floats, only the sender sees them as theirs.
    const live = async (capability: string) => {
      const current = await room(t, capability);
      return t.query(api.sloplash.reactions.live, {
        capability,
        roomCode: current.code,
        phaseGeneration: current.phaseGeneration,
        promptId: prompt.id,
      });
    };
    expect((await live(voter!)).map((r) => [r.emoji, r.mine])).toEqual([
      ["laugh", true],
      ["fire", true],
    ]);
    expect((await live(other!)).every((r) => !r.mine)).toBe(true);
    expect(
      (await mode(t, other!)).round!.prompts.find((p) => p.id === prompt.id)!.liveReactions,
    ).toEqual([]);
    expect(
      (await mode(t, other!))
        .round!.prompts.find((p) => p.id === prompt.id)!
        .answers.flatMap((a) => a.reactions),
    ).toEqual([]);

    await t.mutation(api.sloplash.play.castVote, {
      capability: other!,
      promptId: prompt.id,
      responseId: second!.id,
    });
    expect((await room(t, host.capability)).phase).toBe("REVEAL");
    await expect(react(other!, second!.id)).rejects.toThrow("Reactions open during voting");
  });

  test("human answers are capped at 80 characters", async () => {
    const t = setup();
    const { host, humans } = await sloplashRoom(t, { ai: [] });
    await t.mutation(api.engine.start, { capability: host.capability });
    await heartbeat(t, humans);
    const long = `${"Twelve artisanal ice cubes, chef's choice, ".repeat(3)}served warm`;
    await answerAll(t, [host.capability], () => long);
    const mine = (await rows(t, "responses")).filter((r) => r.text !== FORFEIT_MARKER);
    expect(mine.length).toBeGreaterThan(0);
    for (const response of mine) {
      expect(response.text.length).toBeLessThanOrEqual(80);
      expect(long.startsWith(response.text)).toBe(true);
    }
  });

  test("reveal lasts 8s, a walkover 5s", async () => {
    const t = setup();
    const { host, ana, humans } = await sloplashRoom(t, { ai: [], timers: true });
    await t.mutation(api.engine.start, { capability: host.capability });
    await heartbeat(t, humans);
    await answerAll(t, [host.capability, ana.capability]);
    const writing = await room(t, host.capability);
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: writing.phaseGeneration,
    });
    const walkover = await room(t, host.capability);
    expect(walkover.phase).toBe("REVEAL");
    expect(walkover.phaseDeadline! - walkover.phaseStartedAt).toBe(5_000);
    for (let guard = 0; guard < 4; guard += 1) {
      const current = await room(t, host.capability);
      if (current.phase === "VOTING") break;
      await t.mutation(api.engine.advanceByHost, {
        capability: host.capability,
        expectedPhaseGeneration: current.phaseGeneration,
      });
    }
    const voting = await room(t, host.capability);
    expect(voting.phase).toBe("VOTING");
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: voting.phaseGeneration,
    });
    const reveal = await room(t, host.capability);
    expect(reveal.phase).toBe("REVEAL");
    expect(reveal.phaseDeadline! - reveal.phaseStartedAt).toBe(8_000);
  });
});
