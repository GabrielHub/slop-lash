/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import schema from "./schema";
import {
  QUIZSLOP_HOST_SECRET,
  castFinalAccusationAs,
  castSuspensionVoteAs,
  createPresenceController,
  createQuizslopRoom,
  getAssignments,
  getParticipants,
  getQuizslopState,
  hostAdvance,
  playerIdOf,
  playSectionToResults,
  startQuizslop,
  submitGroupAs,
  submitProxyAs,
  submitScratchAs,
} from "./quizslopTestKit";

const modules = import.meta.glob("./**/*.ts");
function backend() {
  const value = convexTest(schema, modules);
  presenceTest.register(value);
  return value;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T20:00:00.000Z"));
  vi.stubEnv("HOST_SECRET", QUIZSLOP_HOST_SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function startedGame() {
  const testBackend = backend();
  const room = await createQuizslopRoom(testBackend, { joinerNames: ["Bea", "Cody"] });
  const presence = createPresenceController(testBackend);
  await presence.heartbeatAll(room.players);
  await startQuizslop(testBackend, room.host);
  return { testBackend, room };
}

async function playUntilReview(
  testBackend: ReturnType<typeof backend>,
  room: Awaited<ReturnType<typeof createQuizslopRoom>>,
) {
  for (let section = 0; section < 3; section += 1) {
    await playSectionToResults(testBackend, room.host, room.players);
    await hostAdvance(testBackend, room.host);
  }
  expect((await getQuizslopState(testBackend, room.host.gameId)).phase).toBe("PROCTOR_REVIEW_VOTE");
}

async function finishExamToHearing(
  testBackend: ReturnType<typeof backend>,
  room: Awaited<ReturnType<typeof createQuizslopRoom>>,
) {
  while ((await getQuizslopState(testBackend, room.host.gameId)).phase !== "FINAL_ACCUSATION") {
    const phase = (await getQuizslopState(testBackend, room.host.gameId)).phase;
    if (phase === "SECTION_INTRO") {
      await playSectionToResults(testBackend, room.host, room.players);
    } else if (phase === "SECTION_RESULTS" || phase === "PROCTOR_REVIEW_RESULT") {
      await hostAdvance(testBackend, room.host);
    } else if (phase === "PROCTOR_REVIEW_VOTE") {
      for (const player of room.players) {
        await castSuspensionVoteAs(testBackend, player, null);
      }
      await hostAdvance(testBackend, room.host);
    } else {
      throw new Error(`Unexpected phase ${phase}`);
    }
  }
}

describe("QuizSlop Proctor Review and Academic Integrity Hearing", () => {
  test("strict majority suspends one proxy for exactly the next section", async () => {
    const { testBackend, room } = await startedGame();
    await playUntilReview(testBackend, room);
    const target = room.guests[0]!;
    await castSuspensionVoteAs(testBackend, room.host, playerIdOf(target));
    await expect(castSuspensionVoteAs(testBackend, room.host, playerIdOf(target))).resolves.toEqual(
      { phase: "PROCTOR_REVIEW_VOTE" },
    );
    await expect(castSuspensionVoteAs(testBackend, room.host, null)).rejects.toThrow(
      "already locked",
    );
    await castSuspensionVoteAs(testBackend, room.guests[1]!, playerIdOf(target));
    await castSuspensionVoteAs(testBackend, target, null);
    await hostAdvance(testBackend, room.host);
    expect(await getQuizslopState(testBackend, room.host.gameId)).toMatchObject({
      phase: "PROCTOR_REVIEW_RESULT",
      suspendedPlayerId: playerIdOf(target),
      suspensionAppliedSection: 3,
    });
    await hostAdvance(testBackend, room.host);
    const assignments = await getAssignments(testBackend, room.host.gameId);
    const orphan = assignments.find((assignment) => assignment.answerAuthority === "GROUP");
    expect(orphan?.proxyPlayerId).toBe(playerIdOf(target));
    expect(
      assignments.some((assignment) => assignment.candidatePlayerId === playerIdOf(target)),
    ).toBe(true);
    expect(
      assignments.some(
        (assignment) =>
          assignment.proxyPlayerId === playerIdOf(target) && assignment.answerAuthority === "PROXY",
      ),
    ).toBe(false);

    await hostAdvance(testBackend, room.host);
    for (const player of room.players) await submitScratchAs(testBackend, player, true);
    await hostAdvance(testBackend, room.host);
    await expect(submitGroupAs(testBackend, target, true)).rejects.toThrow(
      "suspended player cannot join the group ballot",
    );
    for (const player of room.players) {
      if (playerIdOf(player) === playerIdOf(target)) continue;
      await submitProxyAs(testBackend, player, true);
      await submitGroupAs(testBackend, player, true);
    }
    await hostAdvance(testBackend, room.host);
    expect((await getQuizslopState(testBackend, room.host.gameId)).phase).toBe("SECTION_RESULTS");
    await hostAdvance(testBackend, room.host);
    const nextAssignments = await getAssignments(testBackend, room.host.gameId);
    expect(nextAssignments.every((assignment) => assignment.answerAuthority === "PROXY")).toBe(
      true,
    );
  });

  test("a split review ballot suspends nobody", async () => {
    const { testBackend, room } = await startedGame();
    await playUntilReview(testBackend, room);
    await castSuspensionVoteAs(testBackend, room.players[0]!, playerIdOf(room.players[0]!));
    await castSuspensionVoteAs(testBackend, room.players[1]!, playerIdOf(room.players[1]!));
    await castSuspensionVoteAs(testBackend, room.players[2]!, null);
    await hostAdvance(testBackend, room.host);
    expect(
      (await getQuizslopState(testBackend, room.host.gameId)).suspendedPlayerId,
    ).toBeUndefined();
  });

  test("correct strict-majority accusation restores all sabotage deductions", async () => {
    const { testBackend, room } = await startedGame();
    const saboteur = (await getParticipants(testBackend, room.host.gameId)).find(
      (participant) => participant.role === "SABOTEUR",
    );
    if (!saboteur) throw new Error("Missing saboteur");
    const saboteurSession = room.players.find(
      (session) => playerIdOf(session) === saboteur.playerId,
    );
    if (!saboteurSession) throw new Error("Missing saboteur session");

    await playSectionToResults(testBackend, room.host, room.players, {
      proxyCorrect: (session) => session !== saboteurSession,
      submitDefenses: true,
    });
    await hostAdvance(testBackend, room.host);
    await finishExamToHearing(testBackend, room);
    await castFinalAccusationAs(testBackend, room.players[0]!, saboteur.playerId);
    await castFinalAccusationAs(testBackend, room.players[1]!, saboteur.playerId);
    await castFinalAccusationAs(testBackend, room.players[2]!, playerIdOf(room.players[2]!));
    await hostAdvance(testBackend, room.host);
    const final = await getQuizslopState(testBackend, room.host.gameId);
    expect(final).toMatchObject({
      phase: "FINAL_RESULTS",
      rawCorrect: 17,
      attempted: 18,
      sabotagePoints: 2,
      saboteurIdentified: true,
      adjustedCorrect: 17,
      passed: true,
    });
  });

  test("a wrong accusation leaves sabotage deductions in the final grade", async () => {
    const { testBackend, room } = await startedGame();
    await finishExamToHearing(testBackend, room);
    const participants = await getParticipants(testBackend, room.host.gameId);
    const saboteur = participants.find((participant) => participant.role === "SABOTEUR");
    const innocent = participants.find((participant) => participant.role === "CREW");
    if (!saboteur || !innocent) throw new Error("Missing roles");
    await testBackend.run(async (ctx) => {
      const state = await ctx.db
        .query("quizSlopState")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.host.gameId))
        .unique();
      if (!state) throw new Error("Missing state");
      await ctx.db.patch("quizSlopState", state._id, { sabotagePoints: 2 });
    });
    for (const player of room.players) {
      await castFinalAccusationAs(testBackend, player, innocent.playerId);
    }
    await hostAdvance(testBackend, room.host);
    expect(await getQuizslopState(testBackend, room.host.gameId)).toMatchObject({
      saboteurIdentified: false,
      accusedPlayerId: innocent.playerId,
      adjustedCorrect: 16,
    });
  });
});
