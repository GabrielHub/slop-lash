import { describe, expect, test } from "vite-plus/test";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  adaptQuizslopControllerView,
  adaptQuizslopStageView,
  type BackendQuizslopControllerView,
  type BackendQuizslopStageView,
} from "./quizslop-exam-adapters";

const ASSIGNMENT_ID = "a1" as Id<"quizSlopAssignments">;
const mara = { playerId: "p1" as Id<"players">, name: "Mara" };
const graham = { playerId: "p2" as Id<"players">, name: "Graham" };

function stageView(): BackendQuizslopStageView {
  return {
    roomCode: "SLOP",
    phase: "ORAL_DEFENSE",
    version: 3,
    phaseDeadline: null,
    serverNow: "2026-07-18T20:00:00.000Z",
    timersDisabled: true,
    sectionNumber: 1,
    totalSections: 5,
    passPercent: 70,
    content: { source: "AI", packStatus: "READY", generatorModelName: "Test Model" },
    teamScore: {
      rawCorrect: 3,
      attempted: 4,
      totalQuestions: 20,
      integrityAdjustmentSealed: true,
    },
    roster: [
      {
        ...mara,
        seatOrder: 0,
        connected: true,
        suspendedThisSection: false,
      },
      {
        ...graham,
        seatOrder: 1,
        connected: true,
        suspendedThisSection: true,
      },
    ],
    pairings: [
      {
        assignmentId: ASSIGNMENT_ID,
        candidate: mara,
        proxy: graham,
        authority: "GROUP",
        topic: { label: "Horology" },
        scratchLocked: true,
        officialLocked: false,
      },
    ],
    receipts: [
      {
        assignmentId: ASSIGNMENT_ID,
        candidate: mara,
        proxy: graham,
        authority: "GROUP",
        topic: { label: "Horology" },
        displayPrompt: "What regulates a mechanical watch?",
        choices: ["Balance wheel", "Crown", "Minute hand", "Vibes"],
        scratchSelectedIndex: 0,
        officialSelectedIndex: 1,
        correctIndex: 0,
        scratchCorrect: true,
        officialCorrect: false,
        explanation: "The balance wheel oscillates.",
        defenses: [{ player: mara, kind: "CANDIDATE", text: "I knew the wheel did it." }],
      },
    ],
    submissionProgress: { resolved: 1, total: 2 },
    reviewResult: null,
    final: null,
    me: { isHost: true, playerId: mara.playerId },
    lobby: null,
  };
}

describe("QuizSlop exam view adapters", () => {
  test("uses attempted questions for the live grade and strips hidden roles", () => {
    const adapted = adaptQuizslopStageView(stageView());
    expect(adapted.score).toEqual({
      rawCorrect: 3,
      totalQuestions: 4,
      passingScorePercent: 70,
      integrityAdjustmentSealed: true,
    });
    expect("role" in adapted.roster[0]!).toBe(false);
    expect(adapted.assignments[0]?.proxyMode).toBe("GROUP_VOTE");
    expect(adapted.assignments[0]?.proxy).toBeNull();
    expect(adapted.receipts[0]).not.toHaveProperty("sabotagePointAwarded");
    expect(adapted.receipts[0]?.defenses[0]?.text).toBe("I knew the wheel did it.");
  });

  test("uses the frozen exam total only on the final transcript", () => {
    const source = stageView();
    source.phase = "FINAL_RESULTS";
    source.teamScore.integrityAdjustmentSealed = false;
    source.final = {
      rawCorrect: 16,
      sabotagePoints: 2,
      adjustedCorrect: 16,
      passed: true,
      saboteur: graham,
      saboteurIdentified: true,
    };
    expect(adaptQuizslopStageView(source).final?.totalQuestions).toBe(20);
  });

  test("surfaces authoritative per-assignment lock state on the public ledger", () => {
    // During PROXY_ANSWER no receipts exist yet, so lock state must come from the
    // backend's per-assignment flags, not receipt presence: an official answer
    // filed this phase has to show as locked on the shared ledger.
    const source = stageView();
    source.phase = "PROXY_ANSWER";
    source.receipts = [];
    source.pairings[0]!.officialLocked = true;
    const assignment = adaptQuizslopStageView(source).assignments[0];
    expect(assignment).toMatchObject({ scratchLocked: true, officialLocked: true });
  });

  test("uses the server's aggregate vote count after Proctor Review closes", () => {
    const source = stageView();
    source.phase = "PROCTOR_REVIEW_RESULT";
    source.submissionProgress = null;
    source.reviewResult = { suspendedPlayer: graham, votesCast: 1, votersTotal: 2 };
    expect(adaptQuizslopStageView(source).proctorReview).toMatchObject({
      votesCast: 1,
      votersTotal: 2,
      suspendedPlayerName: "Graham",
    });
  });

  test("preserves an abstention and the private defense task", () => {
    const source: BackendQuizslopControllerView = {
      ...stageView(),
      phase: "PROCTOR_REVIEW_VOTE",
      me: {
        isHost: false,
        playerId: mara.playerId,
        name: "Mara",
        role: "CREW",
      },
      lobby: null,
      candidateAssignment: null,
      proxyAssignment: null,
      groupVoteAssignment: null,
      defenses: [
        {
          assignmentId: ASSIGNMENT_ID,
          kind: "CANDIDATE",
          candidate: mara,
          proxy: graham,
          displayPrompt: "What regulates a mechanical watch?",
          submittedText: null,
          locked: false,
        },
      ],
      suspensionVote: {
        targets: [mara, graham],
        selectedTargetId: null,
        abstained: true,
        locked: true,
      },
      finalAccusation: null,
    };
    const adapted = adaptQuizslopControllerView(source);
    expect(adapted.proctorReview).toMatchObject({ abstained: true, locked: true });
    expect(adapted.defenses[0]).toMatchObject({ kind: "CANDIDATE", locked: false });
  });

  test("keeps the Candidate explanation and Proxy filing as separate simultaneous duties", () => {
    const privateAssignment: NonNullable<BackendQuizslopControllerView["candidateAssignment"]> = {
      assignmentId: ASSIGNMENT_ID,
      candidate: mara,
      topic: { label: "Horology" },
      displayPrompt: "What regulates a mechanical watch?",
      choices: ["Balance wheel", "Crown", "Minute hand", "Vibes"],
      selectedIndex: 0,
      locked: true,
    };
    const source: BackendQuizslopControllerView = {
      ...stageView(),
      phase: "PROXY_ANSWER",
      me: {
        isHost: false,
        playerId: mara.playerId,
        name: "Mara",
        role: "CREW",
      },
      lobby: null,
      candidateAssignment: privateAssignment,
      proxyAssignment: { ...privateAssignment, selectedIndex: null, locked: false },
      groupVoteAssignment: null,
      defenses: [],
      suspensionVote: null,
      finalAccusation: null,
    };
    const adapted = adaptQuizslopControllerView(source);
    expect(adapted.candidateAssignment).toMatchObject({ scratchIndex: 0, scratchLocked: true });
    expect(adapted.proxyAssignment).toMatchObject({ officialIndex: null, officialLocked: false });
  });
});
