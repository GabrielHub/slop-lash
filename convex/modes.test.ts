/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";

// Every model call fails, so these tests exercise the fallbacks that keep a
// room moving when AI is down.
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(async () => {
      throw new Error("model unavailable");
    }),
  };
});

const modules = import.meta.glob("./**/*.ts");
const PERSONA_MODEL = "anthropic/claude-haiku-5.5";

function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  workpoolTest.register(t, "aiGenerationWorkpool");
  return t;
}

type Backend = ReturnType<typeof setup>;

async function view(t: Backend, capability: string) {
  return t.query(api.views.room, { capability });
}

async function drainJobs(t: Backend) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

/** Marks seats as here; draining jobs jumps the clock past their presence. */
async function heartbeat(t: Backend, capabilities: string[]) {
  for (const [index, capability] of capabilities.entries()) {
    await t.mutation(api.presence.heartbeat, {
      capability,
      tabId: `${index}`.padStart(16, "0"),
      interval: 5_000,
    });
  }
}

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("MatchSlop", () => {
  async function matchslopRoom(t: Backend) {
    const host = await t.action(api.rooms.create, {
      gameType: "MATCHSLOP",
      hostSecret: "secret",
      hostName: "Host",
      timersDisabled: true,
      totalRounds: 2,
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

  test("falls back to a hand-written persona when profile generation fails", async () => {
    const t = setup();
    const { host } = await matchslopRoom(t);
    await drainJobs(t);
    const persona = (await mode(t, host.capability)).persona;
    expect(persona.profile?.prompts.length).toBeGreaterThan(0);
    expect(persona.portraitPending).toBe(false);
  });

  test("waits on a late persona without showing a countdown, then moves on", async () => {
    const t = setup();
    const { host, everyone } = await matchslopRoom(t);
    await heartbeat(t, everyone);
    await t.mutation(api.engine.start, { capability: host.capability });
    const waiting = (await view(t, host.capability)).room;
    expect(waiting.phase).toBe("PROFILE");
    // The engine still holds a watchdog deadline; screens just don't see it.
    expect(waiting.phaseDeadline).toBeNull();
    const game = await t.run((ctx) => ctx.db.get("games", waiting.id));
    expect(game?.phaseDeadline).toBeDefined();

    await drainJobs(t);
    expect((await view(t, host.capability)).room.phase).toBe("WRITING");
  });

  test("plays a round end to end even when the persona can't reply", async () => {
    const t = setup();
    const { host, ana, everyone } = await matchslopRoom(t);
    await drainJobs(t);
    await heartbeat(t, everyone);
    await t.mutation(api.engine.start, { capability: host.capability });
    expect((await view(t, host.capability)).room.phase).toBe("WRITING");

    const opener = (await mode(t, host.capability)).persona.profile!.prompts[0]!.id;
    for (const capability of everyone) {
      const round = (await mode(t, capability)).round!;
      await t.mutation(api.matchslop.play.submitResponse, {
        capability,
        promptId: round.promptId,
        text: `hello from ${capability.slice(-4)}`,
        openerPromptId: opener,
      });
    }
    expect((await view(t, host.capability)).room.phase).toBe("VOTING");

    for (const capability of everyone) {
      const round = (await mode(t, capability)).round!;
      const other = round.answers.find((answer) => answer.id !== round.myResponseId)!;
      await t.mutation(api.matchslop.play.castVote, {
        capability,
        promptId: round.promptId,
        responseId: other.id,
      });
    }
    expect((await view(t, host.capability)).room.phase).toBe("SENT");

    // The reply call fails; the persona's canned answer still arrives.
    await drainJobs(t);
    await heartbeat(t, everyone);
    const reply = await view(t, ana.capability);
    expect(reply.room.phase).toBe("REPLY");
    const chat = (await mode(t, ana.capability)).messages;
    expect(chat.map((message) => message.speaker)).toEqual(["PLAYERS", "PERSONA"]);

    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: reply.room.phaseGeneration,
    });
    const next = await view(t, host.capability);
    expect(next.room).toMatchObject({ phase: "WRITING", round: 2 });

    await t.mutation(api.engine.end, { capability: host.capability });
    await drainJobs(t);
    const final = await mode(t, host.capability);
    expect(final.outcome).toBe("TURN_LIMIT");
    expect(final.postMortem).toEqual({ pending: false, value: null });
  });

  test("a lone message is sent without a vote; silence ends the date", async () => {
    const t = setup();
    const { host } = await matchslopRoom(t);
    await drainJobs(t);
    await t.mutation(api.engine.start, { capability: host.capability });
    const round = (await mode(t, host.capability)).round!;
    await t.mutation(api.matchslop.play.submitResponse, {
      capability: host.capability,
      promptId: round.promptId,
      text: "only me",
      openerPromptId: "__photo__",
    });
    const writing = (await view(t, host.capability)).room;
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: writing.phaseGeneration,
    });
    expect((await view(t, host.capability)).room.phase).toBe("SENT");
    await drainJobs(t);
    const replied = (await view(t, host.capability)).room;
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: replied.phaseGeneration,
    });

    // Round two: nobody writes anything.
    const roundTwo = (await view(t, host.capability)).room;
    expect(roundTwo.round).toBe(2);
    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: roundTwo.phaseGeneration,
    });
    expect((await view(t, host.capability)).room.status).toBe("FINISHED");
    expect((await mode(t, host.capability)).outcome).toBe("UNMATCHED");
  });
});

describe("QuizSlop", () => {
  async function mode(t: Backend, capability: string) {
    const current = (await view(t, capability)).mode;
    if (current?.kind !== "QUIZSLOP") throw new Error("wrong mode");
    return current;
  }

  test("plays the whole deck with topic picks, calls, answers, and a voted finale", async () => {
    const t = setup();
    const host = await t.action(api.rooms.create, {
      gameType: "QUIZSLOP",
      hostSecret: "secret",
      hostName: "Host",
      timersDisabled: true,
    });
    const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
    const everyone = [host.capability, ana.capability];

    const topics = (await mode(t, host.capability)).lobby!.topics;
    await t.mutation(api.quizslop.play.chooseTopic, {
      capability: host.capability,
      topicId: topics[0]!.id,
    });
    await expect(
      t.mutation(api.quizslop.play.chooseTopic, {
        capability: ana.capability,
        topicId: topics[0]!.id,
      }),
    ).rejects.toThrow("already picked");

    // Ana never picks; she gets a random topic instead of blocking the start.
    await t.mutation(api.engine.start, { capability: host.capability });
    let room = (await view(t, host.capability)).room;
    expect(room).toMatchObject({ phase: "TOPIC", round: 1, totalRounds: 4 });

    for (let guard = 0; guard < 60 && room.status === "PLAYING"; guard += 1) {
      if (room.phase === "CALL") {
        const seats = (await mode(t, host.capability)).seats;
        const tokens = seats.find((seat) => seat.playerId === host.playerId)!.callTokens;
        await t.mutation(api.quizslop.play.call, {
          capability: host.capability,
          targetId: tokens > 0 ? ana.playerId : null,
        });
        await t.mutation(api.quizslop.play.call, { capability: ana.capability, targetId: null });
      } else if (room.phase === "ANSWER") {
        for (const capability of everyone) {
          const mine = (await mode(t, capability)).answer?.mine;
          expect(mine).not.toBeNull();
          await t.mutation(api.quizslop.play.lockAnswer, { capability, selectedIndex: 0 });
        }
      } else if (room.phase === "REVEAL") {
        // Answers are marked when they lock, so every revealed answer has a verdict.
        const current = await mode(t, host.capability);
        for (const player of current.reveal.flatMap((question) => question.players)) {
          expect(player.points).toBe(player.correct ? current.round!.pointValue : 0);
        }
        expect(current.round?.scores).toEqual([]);
        await t.mutation(api.engine.advanceByHost, {
          capability: host.capability,
          expectedPhaseGeneration: room.phaseGeneration,
        });
      } else if (room.phase === "ROUND_RESULTS") {
        const current = await mode(t, host.capability);
        expect(current.round?.settled).toBe(true);
        expect(current.round?.scores).toHaveLength(2);
        await t.mutation(api.engine.advanceByHost, {
          capability: host.capability,
          expectedPhaseGeneration: room.phaseGeneration,
        });
      } else if (room.phase === "HOUSE_VOTE") {
        const slate = (await mode(t, host.capability)).houseVote!.slate;
        for (const capability of everyone) {
          await t.mutation(api.quizslop.play.houseVote, { capability, topicId: slate[1]!.id });
        }
        expect((await mode(t, host.capability)).round?.topic?.id).toBe(slate[1]!.id);
      } else {
        await t.mutation(api.engine.advanceByHost, {
          capability: host.capability,
          expectedPhaseGeneration: room.phaseGeneration,
        });
      }
      room = (await view(t, host.capability)).room;
    }

    expect(room.status).toBe("FINISHED");
    const final = (await mode(t, host.capability)).final!;
    expect(final.standings).toHaveLength(2);
    expect(final.standings[0]!.rank).toBe(1);
    // Two Slop Calls per game, each settled as a win or a loss.
    const hostSeat = (await mode(t, host.capability)).seats.find(
      (seat) => seat.playerId === host.playerId,
    )!;
    expect(hostSeat.callTokens).toBe(0);
    expect(hostSeat.successfulCalls + hostSeat.incorrectCalls).toBe(2);
  });
});
