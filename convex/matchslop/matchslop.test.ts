/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MATCHSLOP_SENT_MIN_MS } from "../../src/games/matchslop/config/game-config";
import { setup, type Backend, view, drainJobs, runFor, heartbeat } from "../test.harness";

/**
 * Every model call goes through the real task layer and the real
 * `generateText`, against a mock model that answers per task from `script`.
 * A task without a script line gets unusable text, so its call fails.
 */
const script = vi.hoisted(() => ({
  lines: {} as Partial<Record<string, (prompt: string) => string>>,
}));

/** A script answer that makes the mock refuse (finish reason `content-filter`). */
const REFUSE = "__refuse__";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  const { MockLanguageModelV4 } = await import("ai/test");
  const TASKS: [string, string][] = [
    ["You are voting in MatchSlop", "vote"],
    ["You are the match in MatchSlop", "reply"],
    ["You create realistic dating-app personas", "profile"],
    ["You are an AI player in MatchSlop", "botLine"],
    ["The MatchSlop date is over", "postMortem"],
  ];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const text = JSON.stringify(options.prompt);
      const task = TASKS.find(([marker]) => text.includes(marker))?.[1] ?? "unknown";
      const answer = script.lines[task]?.(text) ?? "not json";
      const refused = answer === "__refuse__";
      return {
        content: refused ? [] : [{ type: "text", text: answer }],
        finishReason: refused
          ? { unified: "content-filter", raw: "refusal" }
          : { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 5, text: 5, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  return {
    ...actual,
    generateText: (args: Parameters<typeof actual.generateText>[0]) =>
      actual.generateText({ ...args, model }),
  };
});

const PERSONA_MODEL = "anthropic/claude-haiku-5.5";
const AI_PLAYER_MODEL = "openai/gpt-6.1-sol";

type Room = Awaited<ReturnType<typeof createRoom>>;

async function createRoom(
  t: Backend,
  options: { totalRounds?: number; aiModelIds?: string[] } = {},
) {
  const host = await t.action(api.rooms.create, {
    gameType: "MATCHSLOP",
    hostSecret: "secret",
    hostName: "Host",
    timersDisabled: true,
    totalRounds: options.totalRounds ?? 5,
    ...(options.aiModelIds ? { aiModelIds: options.aiModelIds } : {}),
    settings: {
      matchslop: {
        seekerIdentity: "MAN",
        personaIdentity: "WOMAN",
        personaModelId: PERSONA_MODEL,
      },
    },
  });
  const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
  return { host, ana, everyone: [host.capability, ana.capability] };
}

async function mode(t: Backend, capability: string) {
  const current = (await view(t, capability)).mode;
  if (current?.kind !== "MATCHSLOP") throw new Error("wrong mode");
  return current;
}

async function stateOf(t: Backend, gameId: Id<"games">) {
  return t.run((ctx) =>
    ctx.db
      .query("matchSlopState")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .unique(),
  );
}

async function advance(t: Backend, room: Room) {
  const current = (await view(t, room.host.capability)).room;
  await t.mutation(api.engine.advanceByHost, {
    capability: room.host.capability,
    expectedPhaseGeneration: current.phaseGeneration,
  });
}

async function openerId(t: Backend, room: Room) {
  return (await mode(t, room.host.capability)).persona.profile!.prompts[0]!.id;
}

/** The host sends a lone line, the persona replies, and REPLY is shown. */
async function playLoneRound(t: Backend, room: Room, text = "only me") {
  const current = await mode(t, room.host.capability);
  await t.mutation(api.matchslop.play.submitResponse, {
    capability: room.host.capability,
    promptId: current.round!.promptId,
    text,
    openerPromptId: current.round!.number === 1 ? await openerId(t, room) : null,
  });
  await advance(t, room);
  expect((await view(t, room.host.capability)).room.phase).toBe("SENT");
  await waitForReply(t, room);
}

/**
 * Lets the reply job run and the SENT hold pass, in small steps so the
 * phase's 30s watchdog never fires first.
 */
async function waitForReply(t: Backend, room: Room) {
  await waitForPhase(t, room, "REPLY");
}

/** Runs AI jobs with everyone present until the room reaches `phase` (10s at most). */
async function waitForPhase(t: Backend, room: Room, phase: string) {
  for (let second = 0; second < 10; second += 1) {
    if ((await view(t, room.host.capability)).room.phase === phase) return;
    await heartbeat(t, room.everyone);
    await runFor(t, 1_000);
  }
  expect((await view(t, room.host.capability)).room.phase).toBe(phase);
}

const replyWith =
  (level: string, reply = "ha, ok", thought: string | null = "hm") =>
  () =>
    JSON.stringify({ level, reply, thought });

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  script.lines = {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("MatchSlop rules", () => {
  test("a judged reply moves mood and pays the sent line's author", async () => {
    script.lines.reply = replyWith("good", "ok the tin thing got me", "cute");
    const t = setup();
    const room = await createRoom(t);
    await drainJobs(t);
    await heartbeat(t, room.everyone);
    await t.mutation(api.engine.start, { capability: room.host.capability });

    const opener = await openerId(t, room);
    for (const capability of room.everyone) {
      const round = (await mode(t, capability)).round!;
      await t.mutation(api.matchslop.play.submitResponse, {
        capability,
        promptId: round.promptId,
        text: `hello from ${capability.slice(-4)}`,
        openerPromptId: opener,
      });
    }
    for (const capability of room.everyone) {
      const round = (await mode(t, capability)).round!;
      const other = round.answers.find((answer) => answer.id !== round.myResponseId)!;
      await t.mutation(api.matchslop.play.castVote, {
        capability,
        promptId: round.promptId,
        responseId: other.id,
      });
    }
    await waitForReply(t, room);

    const reply = await view(t, room.host.capability);
    const current = await mode(t, room.host.capability);
    expect(reply.room.phase).toBe("REPLY");
    expect(current.mood).toBe(60);
    expect(current.signal).toMatchObject({
      level: "good",
      delta: 10,
      points: 100,
      thought: "cute",
      source: "model",
    });
    const sent = current.round!.answers.find(
      (answer) => answer.id === current.round!.winnerResponseId,
    )!;
    expect(current.signal!.authorId).toBe(sent.playerId);
    const author = reply.players.find((player) => player.id === sent.playerId)!;
    expect(author.score).toBe(sent.pointsEarned + 100);
    expect(current.messages.at(-1)).toMatchObject({
      speaker: "PERSONA",
      text: "ok the tin thing got me",
      level: "good",
      mood: 60,
      outcome: "CONTINUE",
      authorName: null,
    });
    // Voter chips show real picks only.
    expect(current.round!.answers.flatMap((answer) => answer.voterIds)).toHaveLength(2);
    expect(current.round!.writerIds).toHaveLength(2);
  });

  test("holds the sent line while the persona types", async () => {
    script.lines.reply = replyWith("cute");
    const t = setup();
    const room = await createRoom(t);
    await drainJobs(t);
    await heartbeat(t, room.everyone);
    await t.mutation(api.engine.start, { capability: room.host.capability });
    const round = (await mode(t, room.host.capability)).round!;
    await t.mutation(api.matchslop.play.submitResponse, {
      capability: room.host.capability,
      promptId: round.promptId,
      text: "quick one",
      openerPromptId: await openerId(t, room),
    });
    await advance(t, room);
    const sent = (await view(t, room.host.capability)).room;
    expect(sent.phase).toBe("SENT");

    // The reply lands well inside the hold, but SENT stays up.
    await runFor(t, 2_000);
    const game = await t.run((ctx) => ctx.db.get("games", sent.id));
    expect((await stateOf(t, sent.id))?.reply).toMatchObject({ source: "model", level: "cute" });
    expect(game?.phase).toBe("SENT");
    await heartbeat(t, room.everyone);
    await runFor(t, 1_000);
    expect((await view(t, room.host.capability)).room.phase).toBe("SENT");

    await heartbeat(t, room.everyone);
    vi.advanceTimersByTime(MATCHSLOP_SENT_MIN_MS);
    await t.finishInProgressScheduledFunctions();
    expect((await view(t, room.host.capability)).room.phase).toBe("REPLY");
  });

  test("a photo opener is rejected until the portrait is ready", async () => {
    const t = setup();
    const room = await createRoom(t);
    await drainJobs(t);
    await t.mutation(api.engine.start, { capability: room.host.capability });
    const current = await mode(t, room.host.capability);
    const submit = () =>
      t.mutation(api.matchslop.play.submitResponse, {
        capability: room.host.capability,
        promptId: current.round!.promptId,
        text: "nice photo",
        openerPromptId: "__photo__",
      });
    await expect(submit()).rejects.toThrow("Pick which part");

    const gameId = (await view(t, room.host.capability)).room.id;
    const state = await stateOf(t, gameId);
    await t.run((ctx) =>
      ctx.db.patch("matchSlopState", state!._id, {
        portrait: { status: "READY", url: "https://example.com/nora.png" },
      }),
    );
    await submit();
    expect((await mode(t, room.host.capability)).round!.myResponseId).not.toBeNull();
  });

  test("a failed AI vote abstains instead of voting at random", async () => {
    script.lines.botLine = () => JSON.stringify({ promptId: "P1", line: "bot opener" });
    // No vote script: the AI's ballot call fails.
    const t = setup();
    const room = await createRoom(t, { aiModelIds: [AI_PLAYER_MODEL] });
    await drainJobs(t);
    await heartbeat(t, room.everyone);
    await t.mutation(api.engine.start, { capability: room.host.capability });
    const opener = await openerId(t, room);
    for (const capability of room.everyone) {
      const round = (await mode(t, capability)).round!;
      await t.mutation(api.matchslop.play.submitResponse, {
        capability,
        promptId: round.promptId,
        text: `human ${capability.slice(-4)}`,
        openerPromptId: opener,
      });
    }
    await waitForPhase(t, room, "VOTING");

    for (const capability of room.everyone) {
      const round = (await mode(t, capability)).round!;
      const other = round.answers.find(
        (answer) => answer.id !== round.myResponseId && answer.text === "bot opener",
      )!;
      await t.mutation(api.matchslop.play.castVote, {
        capability,
        promptId: round.promptId,
        responseId: other.id,
      });
    }
    await waitForPhase(t, room, "SENT");
    const gameId = (await view(t, room.host.capability)).room.id;
    const votes = await t.run(async (ctx) => {
      const players = await ctx.db
        .query("players")
        .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
        .take(10);
      const ai = players.find((player) => player.type === "AI")!;
      const all = await ctx.db.query("votes").take(20);
      return { ai: all.filter((vote) => vote.voterId === ai._id), all };
    });
    expect(votes.ai).toHaveLength(1);
    expect(votes.ai[0]!.responseId).toBeUndefined();

    const current = await mode(t, room.host.capability);
    const winner = current.round!.answers.find(
      (answer) => answer.id === current.round!.winnerResponseId,
    )!;
    expect(winner.text).toBe("bot opener");
    // Two human votes at weight 2; the abstaining AI adds nothing.
    expect(winner.weightedVotes).toBe(4);
    expect(current.round!.answers.reduce((sum, answer) => sum + answer.weightedVotes, 0)).toBe(4);
  });

  test("the last shot is round + 1 and the game ends after it", async () => {
    script.lines.reply = replyWith("dealbreaker", "wow. ok.");
    const t = setup();
    const room = await createRoom(t, { totalRounds: 5 });
    await drainJobs(t);
    await heartbeat(t, room.everyone);
    await t.mutation(api.engine.start, { capability: room.host.capability });

    await playLoneRound(t, room);
    expect(await mode(t, room.host.capability)).toMatchObject({ mood: 30, outcome: "IN_PROGRESS" });
    await advance(t, room);

    await playLoneRound(t, room);
    const lastShot = await mode(t, room.host.capability);
    expect(lastShot).toMatchObject({ mood: 10, outcome: "IN_PROGRESS", verdict: null });
    expect(lastShot.messages.at(-1)).toMatchObject({ outcome: "UNMATCHED", level: "dealbreaker" });
    await advance(t, room);

    const comeback = await view(t, room.host.capability);
    expect(comeback.room).toMatchObject({ phase: "WRITING", round: 3 });
    expect((await mode(t, room.host.capability)).comeback).toBe(true);
    await playLoneRound(t, room);
    expect(await mode(t, room.host.capability)).toMatchObject({
      outcome: "UNMATCHED",
      verdict: "UNMATCHED",
    });
    await advance(t, room);
    const final = await view(t, room.host.capability);
    expect(final.room.status).toBe("FINISHED");
    expect(final.room.round).toBe(3);
  });

  test("a comeback at good or better seals the date", async () => {
    script.lines.reply = replyWith("dealbreaker");
    const t = setup();
    const room = await createRoom(t, { totalRounds: 5 });
    await drainJobs(t);
    await heartbeat(t, room.everyone);
    await t.mutation(api.engine.start, { capability: room.host.capability });
    await playLoneRound(t, room);
    await advance(t, room);
    await playLoneRound(t, room);
    await advance(t, room);

    script.lines.reply = replyWith("good", "fine. ONE coffee.");
    await playLoneRound(t, room);
    expect(await mode(t, room.host.capability)).toMatchObject({
      mood: 80,
      outcome: "DATE_SEALED",
      verdict: "DATE",
      signal: { level: "good", delta: 10, points: 100 },
    });
  });

  test("messages are capped at 80 characters", async () => {
    const t = setup();
    const room = await createRoom(t);
    await drainJobs(t);
    await t.mutation(api.engine.start, { capability: room.host.capability });
    const round = (await mode(t, room.host.capability)).round!;
    await t.mutation(api.matchslop.play.submitResponse, {
      capability: room.host.capability,
      promptId: round.promptId,
      text: "x".repeat(120),
      openerPromptId: await openerId(t, room),
    });
    await advance(t, room);
    const sent = (await mode(t, room.host.capability)).messages[0]!;
    expect(sent.text).toHaveLength(80);
  });

  test("the post-mortem is queued at FINAL and lands after a decided REPLY", async () => {
    script.lines.reply = replyWith("great", "coffee saturday?");
    let postMortemPrompt = "";
    script.lines.postMortem = (text) => {
      postMortemPrompt = text;
      return JSON.stringify({
        verdicts: [
          // Players are keyed N1.. in name order: Ana, Host.
          { player: "N2", verdict: "Carried the whole date." },
          { player: "N2", verdict: "A duplicate that is dropped." },
          { player: "N1", verdict: "Quiet, but I saw you." },
        ],
        parting: "see you saturday",
      });
    };
    const t = setup();
    const room = await createRoom(t, { totalRounds: 5 });
    await drainJobs(t);
    await heartbeat(t, room.everyone);
    await t.mutation(api.engine.start, { capability: room.host.capability });
    await playLoneRound(t, room);
    await advance(t, room);
    await playLoneRound(t, room);

    const decided = await mode(t, room.host.capability);
    expect(decided).toMatchObject({ mood: 80, outcome: "DATE_SEALED", postMortem: null });
    const gameId = (await view(t, room.host.capability)).room.id;
    const queued = await t.run((ctx) =>
      ctx.db
        .query("generationJobs")
        .withIndex("by_gameId_and_key", (index) =>
          index.eq("gameId", gameId).eq("key", "postmortem"),
        )
        .unique(),
    );
    expect(queued).toBeNull();

    await advance(t, room);
    expect((await mode(t, room.host.capability)).postMortem).toEqual({
      pending: true,
      value: null,
    });
    await drainJobs(t);
    expect((await mode(t, room.host.capability)).postMortem).toEqual({
      pending: false,
      value: {
        verdicts: [
          { playerName: "Host", verdict: "Carried the whole date." },
          { playerName: "Ana", verdict: "Quiet, but I saw you." },
        ],
        parting: "see you saturday",
      },
    });
    const calls = await t.run((ctx) =>
      ctx.db
        .query("aiCalls")
        .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
        .take(20),
    );
    expect(calls.map((call) => call.task)).toEqual(
      expect.arrayContaining(["matchslop.profile", "matchslop.reply", "matchslop.postMortem"]),
    );
    // The persona sees each player's record, not just the sent lines (the prompt is JSON here).
    expect(postMortemPrompt).toContain('wrote=\\"0\\" sent=\\"0\\">Ana');
    expect(postMortemPrompt).toContain('wrote=\\"2\\" sent=\\"2\\">Host');
  });

  test("plays again with a fresh persona from the same settings", async () => {
    const t = setup();
    const room = await createRoom(t);
    await drainJobs(t);
    await heartbeat(t, room.everyone);
    await t.mutation(api.engine.start, { capability: room.host.capability });
    await t.mutation(api.engine.end, { capability: room.host.capability });
    await drainJobs(t);
    const previousId = (await view(t, room.host.capability)).room.id;
    const previous = await stateOf(t, previousId);

    await heartbeat(t, room.everyone);
    await t.mutation(api.rooms.playAgain, { capability: room.host.capability, gameId: previousId });
    const nextId = (await view(t, room.host.capability)).room.id;
    expect(nextId).not.toBe(previousId);
    const next = await stateOf(t, nextId);
    expect(next).toMatchObject({
      seekerIdentity: previous!.seekerIdentity,
      personaIdentity: previous!.personaIdentity,
      personaModelId: previous!.personaModelId,
      mood: 50,
      outcome: "IN_PROGRESS",
    });
    expect(next!.personaSeedId).not.toBe(previous!.personaSeedId);
    expect(next!.profile).toBeUndefined();

    await drainJobs(t);
    expect((await stateOf(t, nextId))!.profile).toBeDefined();
    expect(await stateOf(t, previousId)).toEqual(previous);
  });

  test("a room never meets the same persona twice while unplayed seeds remain", async () => {
    const profilePrompts: string[] = [];
    const previousProfile = script.lines.profile;
    script.lines.profile = (text) => {
      profilePrompts.push(text);
      return previousProfile?.(text) ?? "not json";
    };
    const t = setup();
    const room = await createRoom(t);
    await drainJobs(t);
    const seeds: string[] = [];
    const names: string[] = [];
    for (let game = 0; game < 4; game += 1) {
      await heartbeat(t, room.everyone);
      const id = (await view(t, room.host.capability)).room.id;
      const state = await stateOf(t, id);
      seeds.push(state!.personaSeedId);
      names.push(state!.profile!.displayName);
      await t.mutation(api.engine.start, { capability: room.host.capability });
      await t.mutation(api.engine.end, { capability: room.host.capability });
      await drainJobs(t);
      await heartbeat(t, room.everyone);
      await t.mutation(api.rooms.playAgain, { capability: room.host.capability, gameId: id });
      await drainJobs(t);
    }
    script.lines.profile = previousProfile;
    expect(new Set(seeds).size).toBe(4);
    // Each later profile call lists the personas the room already met.
    expect(profilePrompts.length).toBeGreaterThanOrEqual(5);
    expect(profilePrompts.at(-1)).toContain("already-met");
    for (const name of names) expect(profilePrompts.at(-1)).toContain(name);
  });
});

async function startedRoom(t: Backend, options: Parameters<typeof createRoom>[1] = {}) {
  const room = await createRoom(t, options);
  await drainJobs(t);
  await heartbeat(t, room.everyone);
  await t.mutation(api.engine.start, { capability: room.host.capability });
  return room;
}

async function jobRow(t: Backend, gameId: Id<"games">, key: string) {
  return t.run((ctx) =>
    ctx.db
      .query("generationJobs")
      .withIndex("by_gameId_and_key", (index) => index.eq("gameId", gameId).eq("key", key))
      .unique(),
  );
}

describe("MatchSlop edge paths", () => {
  test("narrow writes keep room and round boundaries, and retries stay idempotent", async () => {
    const t = setup();
    const room = await startedRoom(t);
    const other = await startedRoom(t);
    for (const [index, capability] of room.everyone.entries()) {
      await t.mutation(api.presence.heartbeat, {
        capability,
        tabId: (index + 10).toString(16).padStart(16, "0"),
        interval: 5_000,
      });
    }
    const round = (await mode(t, room.host.capability)).round!;
    const otherRound = (await mode(t, other.host.capability)).round!;
    const opener = await openerId(t, room);
    const otherOpener = await openerId(t, other);
    const submit = (capability: string, text: string, promptId = round.promptId) =>
      t.mutation(api.matchslop.play.submitResponse, {
        capability,
        promptId,
        text,
        openerPromptId: promptId === otherRound.promptId ? otherOpener : opener,
      });
    await expect(submit(room.host.capability, "Wrong room", otherRound.promptId)).rejects.toThrow(
      /not in this round/,
    );
    await submit(room.host.capability, "Original line");
    await submit(room.host.capability, "Retried with a changed line");
    await submit(room.ana.capability, "The other line");
    await submit(other.host.capability, "Foreign line", otherRound.promptId);
    const ballot = (await mode(t, room.host.capability)).round!;
    const mine = ballot.answers.find((answer) => answer.id === ballot.myResponseId)!;
    const choice = ballot.answers.find((answer) => answer.id !== ballot.myResponseId)!;
    expect(mine.text).toBe("Original line");
    expect(ballot.answers).toHaveLength(2);
    const foreignResponse = (await mode(t, other.host.capability)).round!.myResponseId!;
    const vote = (responseId: Id<"responses">, promptId = round.promptId) =>
      t.mutation(api.matchslop.play.castVote, {
        capability: room.host.capability,
        promptId,
        responseId,
      });
    await expect(vote(foreignResponse)).rejects.toThrow(/not on the ballot/);
    await expect(vote(choice.id, otherRound.promptId)).rejects.toThrow(/moved on/);
    await expect(vote(mine.id)).rejects.toThrow(/yourself/);
    await vote(choice.id);
    await vote(choice.id);
    const after = (await mode(t, room.host.capability)).round!;
    expect(after.votedPlayerIds).toHaveLength(1);
    expect(after.myVoteResponseId).toBe(choice.id);
  });

  test("a later reply credits only the current turn's author", async () => {
    script.lines.reply = replyWith("good");
    const t = setup();
    const room = await startedRoom(t);
    await playLoneRound(t, room);
    const firstReply = await view(t, room.host.capability);
    const hostScore = firstReply.players.find((player) => player.name === "Host")!.score;
    const oldPrompt = (await mode(t, room.host.capability)).round!.promptId;
    await advance(t, room);
    const round = (await mode(t, room.ana.capability)).round!;
    await expect(
      t.mutation(api.matchslop.play.submitResponse, {
        capability: room.ana.capability,
        promptId: oldPrompt,
        text: "Stale round",
        openerPromptId: null,
      }),
    ).rejects.toThrow(/not in this round/);
    await t.mutation(api.matchslop.play.submitResponse, {
      capability: room.ana.capability,
      promptId: round.promptId,
      text: "A new round with a new author",
      openerPromptId: null,
    });
    await advance(t, room);
    await waitForReply(t, room);
    const reply = await view(t, room.host.capability);
    const ana = reply.players.find((player) => player.name === "Ana")!;
    expect((await mode(t, room.host.capability)).signal!.authorId).toBe(ana.id);
    expect(ana.score).toBe(100);
    expect(reply.players.find((player) => player.name === "Host")!.score).toBe(hostScore);
  });

  test("waiting on the AI is flagged, so a timers-off host never skips it in one tap", async () => {
    script.lines.reply = replyWith("cute");
    const t = setup();
    const room = await createRoom(t);
    await heartbeat(t, room.everyone);
    // Started before the profile lands: PROFILE waits on the AI.
    await t.mutation(api.engine.start, { capability: room.host.capability });
    const profile = (await view(t, room.host.capability)).room;
    expect(profile).toMatchObject({ phase: "PROFILE", phaseDeadline: null, awaitingAi: true });

    await waitForPhase(t, room, "WRITING");
    const writing = (await view(t, room.host.capability)).room;
    expect(writing).toMatchObject({ timersDisabled: true, phaseDeadline: null, awaitingAi: false });

    const round = (await mode(t, room.host.capability)).round!;
    await t.mutation(api.matchslop.play.submitResponse, {
      capability: room.host.capability,
      promptId: round.promptId,
      text: "hi",
      openerPromptId: await openerId(t, room),
    });
    await advance(t, room);
    const sent = (await view(t, room.host.capability)).room;
    expect(sent).toMatchObject({ phase: "SENT", phaseDeadline: null, awaitingAi: true });
  });

  test("a blank reply is a canned, unscored fallback and its job is FAILED", async () => {
    script.lines.reply = replyWith("good", "   ");
    const t = setup();
    const room = await startedRoom(t);
    await playLoneRound(t, room);
    const current = await mode(t, room.host.capability);
    expect(current.mood).toBe(50);
    expect(current.signal).toMatchObject({ level: null, delta: 0, points: 0, source: "fallback" });
    expect(current.messages.at(-1)).toMatchObject({
      speaker: "PERSONA",
      text: "sorry, got distracted. say that again?",
      level: null,
    });
    const gameId = (await view(t, room.host.capability)).room.id;
    expect(await jobRow(t, gameId, "reply:1")).toMatchObject({
      status: "FAILED",
      failReason: "invalid-output",
    });
  });

  test("a refused reply is declined: canned, unscored, mood unchanged", async () => {
    script.lines.reply = () => REFUSE;
    const t = setup();
    const room = await startedRoom(t);
    await playLoneRound(t, room);
    const current = await mode(t, room.host.capability);
    expect(current.mood).toBe(50);
    expect(current.signal).toMatchObject({ points: 0, source: "declined" });
    expect(current.messages.at(-1)!.text).toBe("ok, moving on.");
    const gameId = (await view(t, room.host.capability)).room.id;
    expect(await jobRow(t, gameId, "reply:1")).toMatchObject({
      status: "FAILED",
      failReason: "refused",
    });
  });

  test("text the model echoed entity-escaped is shown decoded", async () => {
    script.lines.reply = replyWith("cute", "&lt;3 &amp; stuff", "you &gt; him");
    const t = setup();
    const room = await startedRoom(t);
    await playLoneRound(t, room, "<3 you > him");
    const current = await mode(t, room.host.capability);
    expect(current.messages.at(-1)!.text).toBe("<3 & stuff");
    expect(current.signal!.thought).toBe("you > him");
  });

  test("while voting, nobody sees other authors, votes or points", async () => {
    const t = setup();
    const room = await startedRoom(t);
    const opener = await openerId(t, room);
    for (const capability of room.everyone) {
      const round = (await mode(t, capability)).round!;
      await t.mutation(api.matchslop.play.submitResponse, {
        capability,
        promptId: round.promptId,
        text: `line ${capability.slice(-4)}`,
        openerPromptId: opener,
      });
    }
    expect((await view(t, room.host.capability)).room.phase).toBe("VOTING");
    const hostRound = (await mode(t, room.host.capability)).round!;
    const anaLine = hostRound.answers.find((answer) => answer.id !== hostRound.myResponseId)!;
    await t.mutation(api.matchslop.play.castVote, {
      capability: room.host.capability,
      promptId: hostRound.promptId,
      responseId: anaLine.id,
    });

    for (const capability of room.everyone) {
      const round = (await mode(t, capability)).round!;
      expect(round.winnerResponseId).toBeNull();
      expect(round.answers).toHaveLength(2);
      for (const answer of round.answers) {
        const mine = answer.id === round.myResponseId;
        expect(answer.playerId === null).toBe(!mine);
        expect(answer).toMatchObject({
          voterIds: [],
          weightedVotes: 0,
          rawVotes: 0,
          pointsEarned: 0,
        });
      }
    }
  });

  test("the last round forces a verdict: under the date line is no second date", async () => {
    script.lines.reply = replyWith("good");
    const t = setup();
    const room = await startedRoom(t, { totalRounds: 2 });
    await playLoneRound(t, room);
    expect(await mode(t, room.host.capability)).toMatchObject({ mood: 60, outcome: "IN_PROGRESS" });
    await advance(t, room);
    await playLoneRound(t, room);
    const last = await mode(t, room.host.capability);
    expect(last).toMatchObject({ mood: 70, outcome: "UNMATCHED", verdict: "NO_SECOND_DATE" });
    expect(last.messages.at(-1)).toMatchObject({ outcome: "UNMATCHED", level: "good" });
    await advance(t, room);
    expect((await view(t, room.host.capability)).room).toMatchObject({
      status: "FINISHED",
      round: 2,
    });
  });

  test("the last round seals the date at the date line", async () => {
    script.lines.reply = replyWith("great");
    const t = setup();
    const room = await startedRoom(t, { totalRounds: 3 });
    await playLoneRound(t, room);
    await advance(t, room);
    await playLoneRound(t, room);
    expect(await mode(t, room.host.capability)).toMatchObject({
      mood: 80,
      outcome: "DATE_SEALED",
      verdict: "DATE",
    });
  });

  test("a reply that lands after the hold advances at once", async () => {
    script.lines.reply = replyWith("cute", "sorry, was driving");
    const t = setup();
    const room = await startedRoom(t);
    const round = (await mode(t, room.host.capability)).round!;
    await t.mutation(api.matchslop.play.submitResponse, {
      capability: room.host.capability,
      promptId: round.promptId,
      text: "hi",
      openerPromptId: await openerId(t, room),
    });
    await advance(t, room);
    const sent = (await view(t, room.host.capability)).room;
    expect(sent.phase).toBe("SENT");
    expect((await stateOf(t, sent.id))?.reply).toBeUndefined();

    // The clock passes the hold before the reply job has run at all.
    vi.setSystemTime(Date.now() + MATCHSLOP_SENT_MIN_MS + 2_000);
    await heartbeat(t, room.everyone);
    await runFor(t, 500);
    const reply = await view(t, room.host.capability);
    expect(reply.room.phase).toBe("REPLY");
    // No second hold: REPLY starts as the late reply lands.
    expect(reply.room.phaseStartedAt - sent.phaseStartedAt).toBeLessThan(
      MATCHSLOP_SENT_MIN_MS + 3_000,
    );
    expect((await mode(t, room.host.capability)).messages.at(-1)!.text).toBe("sorry, was driving");
  });

  test("a bot line over 80 characters is trimmed at a word", async () => {
    script.lines.botLine = () =>
      JSON.stringify({
        promptId: "P1",
        line: "tarot ".repeat(10) + "and anchovies forever ".repeat(4),
      });
    const t = setup();
    const room = await startedRoom(t, { aiModelIds: [AI_PLAYER_MODEL] });
    const gameId = (await view(t, room.host.capability)).room.id;
    for (let second = 0; second < 3; second += 1) {
      await heartbeat(t, room.everyone);
      await runFor(t, 1_000);
    }
    const lines = await t.run(async (ctx) => {
      const players = await ctx.db
        .query("players")
        .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
        .take(10);
      const ai = players.find((player) => player.type === "AI")!;
      const responses = await ctx.db.query("responses").take(20);
      return responses.filter((response) => response.playerId === ai._id);
    });
    expect(lines).toHaveLength(1);
    const text = lines[0]!.text;
    expect(text.length).toBeLessThanOrEqual(80);
    expect(text.length).toBeGreaterThan(60);
    expect(text.startsWith("tarot tarot")).toBe(true);
    // Cut at a word boundary, with an ellipsis.
    expect(/ (?:tarot|and|anchovies|forever)…$/u.test(text)).toBe(true);
  });

  test("a comeback whose reply falls back is unmatched, and scores nothing", async () => {
    script.lines.reply = replyWith("dealbreaker");
    const t = setup();
    const room = await startedRoom(t, { totalRounds: 5 });
    await playLoneRound(t, room);
    await advance(t, room);
    await playLoneRound(t, room);
    await advance(t, room);
    expect((await mode(t, room.host.capability)).comeback).toBe(true);

    script.lines.reply = undefined;
    await playLoneRound(t, room);
    const current = await mode(t, room.host.capability);
    expect(current).toMatchObject({
      mood: 10,
      outcome: "UNMATCHED",
      verdict: "UNMATCHED",
      signal: { points: 0, source: "fallback" },
    });
    await advance(t, room);
    expect((await view(t, room.host.capability)).room.status).toBe("FINISHED");
  });
});
