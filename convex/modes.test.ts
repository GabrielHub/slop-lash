/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import { setup, type Backend, view, drainJobs, heartbeat } from "./test.harness";

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

const PERSONA_MODEL = "anthropic/claude-haiku-5.5";

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
    expect(persona.portraitUrl).toBeNull();
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
    const replied = await mode(t, ana.capability);
    expect(replied.messages.map((message) => message.speaker)).toEqual(["PLAYERS", "PERSONA"]);
    // A stand-in reply never moves mood or points: the author keeps vote points only.
    expect(replied.mood).toBe(50);
    expect(replied.signal).toMatchObject({ source: "fallback", level: null, points: 0 });
    const sent = replied.round!.answers.find(
      (answer) => answer.id === replied.round!.winnerResponseId,
    )!;
    const author = reply.players.find((player) => player.id === replied.signal!.authorId)!;
    expect(author.score).toBe(sent.pointsEarned);

    await t.mutation(api.engine.advanceByHost, {
      capability: host.capability,
      expectedPhaseGeneration: reply.room.phaseGeneration,
    });
    const next = await view(t, host.capability);
    expect(next.room).toMatchObject({ phase: "WRITING", round: 2 });

    await t.mutation(api.engine.end, { capability: host.capability });
    await drainJobs(t);
    const final = await mode(t, host.capability);
    expect(final.outcome).toBe("UNMATCHED");
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
      openerPromptId: (await mode(t, host.capability)).persona.profile!.prompts[0]!.id,
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

  test("plays the whole deck with topic picks, bets, answers, and a voted last round", async () => {
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
    expect(room).toMatchObject({ phase: "CALL", round: 1, totalRounds: 4 });

    const visited: string[] = [];
    for (let guard = 0; guard < 60 && room.status === "PLAYING"; guard += 1) {
      visited.push(`${room.phase}:${room.round}`);
      if (room.phase === "CALL") {
        // Only players with a bet left are asked.
        const eligible = (await mode(t, host.capability)).calls.eligiblePlayerIds;
        if (eligible.includes(host.playerId!)) {
          await t.mutation(api.quizslop.play.call, {
            capability: host.capability,
            targetId: ana.playerId,
          });
        }
        if (eligible.includes(ana.playerId!)) {
          await t.mutation(api.quizslop.play.call, { capability: ana.capability, targetId: null });
        }
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
    expect(visited.some((entry) => entry.startsWith("TOPIC:"))).toBe(false);
    expect(visited).not.toContain("ROUND_RESULTS:4");
    expect(visited).toContain("REVEAL:4");
    const final = (await mode(t, host.capability)).final!;
    expect(final.standings).toHaveLength(2);
    expect(final.standings[0]!.rank).toBe(1);
    // Two bets per game, each settled as a win or a loss.
    const hostSeat = (await mode(t, host.capability)).seats.find(
      (seat) => seat.playerId === host.playerId,
    )!;
    expect(hostSeat.callTokens).toBe(0);
    expect(hostSeat.successfulCalls + hostSeat.incorrectCalls).toBe(2);
  });
});
