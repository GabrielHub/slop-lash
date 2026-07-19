import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  listAccusations,
  listAssignmentDefenses,
  listGroupAnswers,
  listQuizslopParticipants,
  listRoundAssignments,
  listSuspensionVotes,
  loadQuizslopRoundBySection,
} from "./quizslopData";
import { transitionQuizslopPhase, type QuizslopEngineBundle } from "./quizslopLifecycle";
import { assertFrozenQuestionIntegrity } from "./quizslopIntegrity";
import { materializeSectionAssignments } from "./quizslopSetup";
import { applyLadderResult } from "../src/games/quizslop/difficulty";
import {
  finalExamScore,
  resolveGroupAnswer,
  sabotageForAnswer,
  strictMajorityChoice,
} from "../src/games/quizslop/cooperative";
import {
  FINAL_ACCUSATION_SECONDS,
  ORAL_DEFENSE_SECONDS,
  PROCTOR_REVIEW_RESULT_SECONDS,
  PROCTOR_REVIEW_VOTE_SECONDS,
  PROXY_ANSWER_SECONDS,
  SCRATCH_SECONDS,
  SECTION_INTRO_SECONDS,
  SECTION_RESULTS_SECONDS,
} from "../src/games/quizslop/game-constants";
import type { QuizslopPhase } from "../src/games/quizslop/types";

async function loadCurrentRound(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
): Promise<Doc<"quizSlopRounds">> {
  const round = await loadQuizslopRoundBySection(ctx, bundle.game._id, bundle.state.deckPosition);
  if (!round) throw new ConvexError("QuizSlop section is missing");
  return round;
}

async function questionForAssignment(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  assignment: Doc<"quizSlopAssignments">,
) {
  if (assignment.gameId !== bundle.game._id) {
    throw new ConvexError("The frozen QuizSlop question failed its integrity check");
  }
  const question = await ctx.db.get("quizSlopQuestions", assignment.questionId);
  if (!question) {
    throw new ConvexError("The frozen QuizSlop question failed its integrity check");
  }
  await assertFrozenQuestionIntegrity(ctx, {
    gameId: bundle.game._id,
    topicId: assignment.topicId,
    expectedTier: assignment.tierAtAssignment,
    question,
  });
  return question;
}

function requireCompleteSectionAssignments(
  bundle: QuizslopEngineBundle,
  round: Doc<"quizSlopRounds">,
  assignments: readonly Doc<"quizSlopAssignments">[],
  participants: readonly Doc<"quizSlopParticipants">[],
): void {
  const participantIds = new Set(participants.map((participant) => participant.playerId));
  const candidateIds = new Set(assignments.map((assignment) => assignment.candidatePlayerId));
  const proxyIds = new Set(assignments.map((assignment) => assignment.proxyPlayerId));
  const groupAssignments = assignments.filter(
    (assignment) => assignment.answerAuthority === "GROUP",
  );
  const expectedGroupProxy =
    bundle.state.suspensionAppliedSection === bundle.state.deckPosition
      ? bundle.state.suspendedPlayerId
      : undefined;
  if (
    assignments.length !== participants.length ||
    candidateIds.size !== participants.length ||
    proxyIds.size !== participants.length ||
    [...candidateIds].some((playerId) => !participantIds.has(playerId)) ||
    [...proxyIds].some((playerId) => !participantIds.has(playerId)) ||
    assignments.some(
      (assignment) =>
        assignment.gameId !== bundle.game._id ||
        assignment.roundId !== round._id ||
        assignment.candidatePlayerId === assignment.proxyPlayerId,
    ) ||
    new Set(assignments.map((assignment) => assignment.topicId)).size !== assignments.length ||
    new Set(assignments.map((assignment) => assignment.questionId)).size !== assignments.length ||
    groupAssignments.length !== (expectedGroupProxy ? 1 : 0) ||
    (expectedGroupProxy !== undefined && groupAssignments[0]?.proxyPlayerId !== expectedGroupProxy)
  ) {
    throw new ConvexError("The frozen QuizSlop section failed its assignment integrity check");
  }
}

async function closeScratch(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const round = await loadCurrentRound(ctx, bundle);
  const [assignments, participants] = await Promise.all([
    listRoundAssignments(ctx, round._id),
    listQuizslopParticipants(ctx, bundle.game._id),
  ]);
  const participantByPlayer = new Map(
    participants.map((participant) => [participant.playerId, participant]),
  );
  requireCompleteSectionAssignments(bundle, round, assignments, participants);
  const validatedAssignments = await Promise.all(
    assignments.map(async (assignment) => ({
      assignment,
      question: await questionForAssignment(ctx, bundle, assignment),
    })),
  );
  await Promise.all(
    validatedAssignments.map(async ({ assignment, question }) => {
      const participant = participantByPlayer.get(assignment.candidatePlayerId);
      if (!participant) throw new ConvexError("Candidate is missing from the frozen roster");
      const scratchCorrect =
        assignment.scratchSelectedIndex === undefined
          ? null
          : assignment.scratchSelectedIndex === question.correctIndex;
      await Promise.all([
        ctx.db.patch("quizSlopAssignments", assignment._id, {
          ...(scratchCorrect === null ? {} : { scratchCorrect }),
          ...(assignment.scratchLockedAt === undefined ? { scratchLockedAt: now } : {}),
        }),
        scratchCorrect === null
          ? Promise.resolve()
          : ctx.db.patch("quizSlopParticipants", participant._id, {
              hiddenTier: applyLadderResult(
                participant.hiddenTier,
                scratchCorrect ? "CORRECT" : "INCORRECT",
              ),
            }),
      ]);
    }),
  );
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "PROXY_ANSWER",
    now,
    deadlineSeconds: PROXY_ANSWER_SECONDS,
  });
}

async function officialSelectionFor(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  assignment: Doc<"quizSlopAssignments">,
  participants: readonly Doc<"quizSlopParticipants">[],
): Promise<number | null> {
  if (assignment.answerAuthority === "PROXY") {
    return assignment.officialSelectedIndex ?? null;
  }
  const ballots = await listGroupAnswers(ctx, assignment._id);
  const eligibleVoterIds = new Set(
    participants
      .filter((participant) => participant.playerId !== assignment.proxyPlayerId)
      .map((participant) => participant.playerId),
  );
  if (
    new Set(ballots.map((ballot) => ballot.voterId)).size !== ballots.length ||
    ballots.some(
      (ballot) =>
        ballot.gameId !== bundle.game._id ||
        ballot.roundId !== assignment.roundId ||
        ballot.assignmentId !== assignment._id ||
        !eligibleVoterIds.has(ballot.voterId),
    )
  ) {
    throw new ConvexError("The class ballot failed its eligibility check");
  }
  return resolveGroupAnswer({
    ballots: ballots.map((ballot) => ballot.selectedIndex),
    eligibleVoterCount: eligibleVoterIds.size,
    candidateScratch: assignment.scratchSelectedIndex ?? null,
    seed: `${bundle.game._id}:${assignment.roundId}:${assignment._id}`,
    choiceCount: 4,
  });
}

async function closeProxyAnswers(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const round = await loadCurrentRound(ctx, bundle);
  const [assignments, participants] = await Promise.all([
    listRoundAssignments(ctx, round._id),
    listQuizslopParticipants(ctx, bundle.game._id),
  ]);
  const participantByPlayer = new Map(
    participants.map((participant) => [participant.playerId, participant]),
  );
  requireCompleteSectionAssignments(bundle, round, assignments, participants);
  const validatedAssignments = await Promise.all(
    assignments.map(async (assignment) => {
      const [question, officialSelectedIndex] = await Promise.all([
        questionForAssignment(ctx, bundle, assignment),
        officialSelectionFor(ctx, bundle, assignment, participants),
      ]);
      return { assignment, question, officialSelectedIndex };
    }),
  );
  const settledAssignments = validatedAssignments.map(
    ({ assignment, question, officialSelectedIndex }) => {
      const proxy = participantByPlayer.get(assignment.proxyPlayerId);
      if (!proxy) throw new ConvexError("Proxy is missing from the frozen roster");
      const officialCorrect = officialSelectedIndex === question.correctIndex;
      const answeredBySaboteur =
        assignment.answerAuthority === "PROXY" && proxy.role === "SABOTEUR";
      const sabotageDelta = sabotageForAnswer({
        scratchCorrect: assignment.scratchCorrect === true,
        officialCorrect,
        answeredBySaboteur,
      });
      return { assignment, officialSelectedIndex, officialCorrect, sabotageDelta };
    },
  );
  const sectionCorrect = settledAssignments.filter(
    (assignment) => assignment.officialCorrect,
  ).length;
  const sectionSabotage = settledAssignments.reduce(
    (total, assignment) => total + assignment.sabotageDelta,
    0,
  );
  await Promise.all(
    settledAssignments.map(({ assignment, officialSelectedIndex, officialCorrect }) =>
      ctx.db.patch("quizSlopAssignments", assignment._id, {
        ...(officialSelectedIndex === null ? {} : { officialSelectedIndex }),
        officialLockedAt: assignment.officialLockedAt ?? now,
        officialCorrect,
      }),
    ),
  );
  const statePatch = {
    rawCorrect: bundle.state.rawCorrect + sectionCorrect,
    attempted: bundle.state.attempted + assignments.length,
    sabotagePoints: bundle.state.sabotagePoints + sectionSabotage,
  };
  await ctx.db.patch("quizSlopState", bundle.state._id, statePatch);
  bundle.state = { ...bundle.state, ...statePatch };
  const hasWrongOfficialAnswer = sectionCorrect < assignments.length;
  await transitionQuizslopPhase(ctx, bundle, {
    phase: hasWrongOfficialAnswer ? "ORAL_DEFENSE" : "SECTION_RESULTS",
    now,
    deadlineSeconds: hasWrongOfficialAnswer ? ORAL_DEFENSE_SECONDS : SECTION_RESULTS_SECONDS,
  });
}

function requiredDefensePlayers(
  assignments: readonly Doc<"quizSlopAssignments">[],
): { assignmentId: Id<"quizSlopAssignments">; playerId: Id<"players"> }[] {
  return assignments.flatMap((assignment) => {
    if (assignment.officialCorrect !== false) return [];
    const candidate = { assignmentId: assignment._id, playerId: assignment.candidatePlayerId };
    return assignment.answerAuthority === "PROXY"
      ? [candidate, { assignmentId: assignment._id, playerId: assignment.proxyPlayerId }]
      : [candidate];
  });
}

async function openSectionResults(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "SECTION_RESULTS",
    now,
    deadlineSeconds: SECTION_RESULTS_SECONDS,
  });
}

async function settleSuspensionVote(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const [participants, votes] = await Promise.all([
    listQuizslopParticipants(ctx, bundle.game._id),
    listSuspensionVotes(ctx, bundle.game._id),
  ]);
  const participantIds = new Set(participants.map((participant) => participant.playerId));
  if (
    new Set(votes.map((vote) => vote.playerId)).size !== votes.length ||
    votes.some(
      (vote) =>
        vote.gameId !== bundle.game._id ||
        !participantIds.has(vote.playerId) ||
        (vote.targetPlayerId !== undefined && !participantIds.has(vote.targetPlayerId)),
    )
  ) {
    throw new ConvexError("The Proctor Review ballot failed its eligibility check");
  }
  const majorityTarget = strictMajorityChoice(
    votes.flatMap((vote) => (vote.targetPlayerId ? [vote.targetPlayerId] : [])),
    participants.length,
  );
  if (majorityTarget) {
    const validTarget = participants.some((participant) => participant.playerId === majorityTarget);
    if (!validTarget) throw new ConvexError("Suspension vote targeted a non-participant");
    const statePatch = {
      suspendedPlayerId: majorityTarget,
      suspensionAppliedSection: bundle.state.deckPosition + 1,
    };
    await ctx.db.patch("quizSlopState", bundle.state._id, statePatch);
    bundle.state = { ...bundle.state, ...statePatch };
  }
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "PROCTOR_REVIEW_RESULT",
    now,
    deadlineSeconds: PROCTOR_REVIEW_RESULT_SECONDS,
  });
}

async function settleFinalAccusation(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const [participants, accusations] = await Promise.all([
    listQuizslopParticipants(ctx, bundle.game._id),
    listAccusations(ctx, bundle.game._id),
  ]);
  const participantIds = new Set(participants.map((participant) => participant.playerId));
  if (
    new Set(accusations.map((accusation) => accusation.playerId)).size !== accusations.length ||
    accusations.some(
      (accusation) =>
        accusation.gameId !== bundle.game._id ||
        !participantIds.has(accusation.playerId) ||
        !participantIds.has(accusation.targetPlayerId),
    )
  ) {
    throw new ConvexError("The integrity hearing ballot failed its eligibility check");
  }
  const majorityTarget = strictMajorityChoice(
    accusations.map((accusation) => accusation.targetPlayerId),
    participants.length,
  );
  const saboteurs = participants.filter((participant) => participant.role === "SABOTEUR");
  const expectedAttempts = participants.length * (bundle.state.sectionCount ?? Number.NaN);
  if (
    saboteurs.length !== 1 ||
    !Number.isInteger(expectedAttempts) ||
    bundle.state.attempted !== expectedAttempts ||
    !Number.isInteger(bundle.state.rawCorrect) ||
    bundle.state.rawCorrect < 0 ||
    bundle.state.rawCorrect > bundle.state.attempted ||
    !Number.isInteger(bundle.state.sabotagePoints) ||
    bundle.state.sabotagePoints < 0
  ) {
    throw new ConvexError("The final QuizSlop transcript failed its integrity check");
  }
  const saboteur = saboteurs[0];
  if (!saboteur) throw new ConvexError("QuizSlop saboteur is missing");
  const saboteurIdentified = majorityTarget === saboteur.playerId;
  const final = finalExamScore({
    rawCorrect: bundle.state.rawCorrect,
    attempted: bundle.state.attempted,
    sabotagePoints: bundle.state.sabotagePoints,
    saboteurIdentified,
  });
  const statePatch = {
    ...(majorityTarget ? { accusedPlayerId: majorityTarget } : {}),
    saboteurIdentified,
    adjustedCorrect: final.adjustedCorrect,
    gradePercent: final.gradePercent,
    passed: final.passed,
  };
  await ctx.db.patch("quizSlopState", bundle.state._id, statePatch);
  bundle.state = { ...bundle.state, ...statePatch };
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "FINAL_RESULTS",
    now,
    deadlineSeconds: null,
  });
}

async function startNextSection(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const nextSection = bundle.state.deckPosition + 1;
  await materializeSectionAssignments(ctx, bundle, nextSection, now);
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "SECTION_INTRO",
    now,
    deadlineSeconds: SECTION_INTRO_SECONDS,
    deckPosition: nextSection,
    currentRound: nextSection + 1,
  });
}

async function advanceAfterSectionResults(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const sectionNumber = bundle.state.deckPosition + 1;
  if (sectionNumber === bundle.state.reviewAfterSection) {
    await transitionQuizslopPhase(ctx, bundle, {
      phase: "PROCTOR_REVIEW_VOTE",
      now,
      deadlineSeconds: PROCTOR_REVIEW_VOTE_SECONDS,
    });
    return;
  }
  if (sectionNumber >= (bundle.state.sectionCount ?? bundle.game.totalRounds)) {
    await transitionQuizslopPhase(ctx, bundle, {
      phase: "FINAL_ACCUSATION",
      now,
      deadlineSeconds: FINAL_ACCUSATION_SECONDS,
    });
    return;
  }
  await startNextSection(ctx, bundle, now);
}

/** Advances one phase, applying timeout/default semantics for unresolved submissions. */
export async function forceAdvanceQuizslop(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<QuizslopPhase | null> {
  switch (bundle.state.phase) {
    case "SECTION_INTRO":
      await transitionQuizslopPhase(ctx, bundle, {
        phase: "SCRATCH",
        now,
        deadlineSeconds: SCRATCH_SECONDS,
      });
      break;
    case "SCRATCH":
      await closeScratch(ctx, bundle, now);
      break;
    case "PROXY_ANSWER":
      await closeProxyAnswers(ctx, bundle, now);
      break;
    case "ORAL_DEFENSE":
      await openSectionResults(ctx, bundle, now);
      break;
    case "SECTION_RESULTS":
      await advanceAfterSectionResults(ctx, bundle, now);
      break;
    case "PROCTOR_REVIEW_VOTE":
      await settleSuspensionVote(ctx, bundle, now);
      break;
    case "PROCTOR_REVIEW_RESULT":
      await startNextSection(ctx, bundle, now);
      break;
    case "FINAL_ACCUSATION":
      await settleFinalAccusation(ctx, bundle, now);
      break;
    default:
      return null;
  }
  return bundle.state.phase;
}

async function allRequiredDefensesSubmitted(
  ctx: MutationCtx,
  roundId: Id<"quizSlopRounds">,
): Promise<boolean> {
  const assignments = await listRoundAssignments(ctx, roundId);
  const required = requiredDefensePlayers(assignments);
  const defensesByAssignment = new Map<Id<"quizSlopAssignments">, Set<Id<"players">>>();
  for (const { assignmentId } of required) {
    if (defensesByAssignment.has(assignmentId)) continue;
    const defenses = await listAssignmentDefenses(ctx, assignmentId);
    defensesByAssignment.set(assignmentId, new Set(defenses.map((defense) => defense.playerId)));
  }
  return required.every(({ assignmentId, playerId }) =>
    defensesByAssignment.get(assignmentId)?.has(playerId),
  );
}

/** Quorum advancement is disabled in host-paced Tutorial Mode. */
export async function settleQuizslopQuorum(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<QuizslopPhase | null> {
  if (bundle.game.timersDisabled) return null;
  const participants = await listQuizslopParticipants(ctx, bundle.game._id);
  const round = await loadCurrentRound(ctx, bundle);
  let complete = false;
  if (bundle.state.phase === "SCRATCH") {
    complete = (await listRoundAssignments(ctx, round._id)).every(
      (assignment) => assignment.scratchLockedAt !== undefined,
    );
  } else if (bundle.state.phase === "PROXY_ANSWER") {
    const assignments = await listRoundAssignments(ctx, round._id);
    complete = true;
    for (const assignment of assignments) {
      if (assignment.answerAuthority === "PROXY") {
        if (assignment.officialLockedAt === undefined) complete = false;
      } else {
        const ballots = await listGroupAnswers(ctx, assignment._id);
        if (ballots.length < Math.max(0, participants.length - 1)) complete = false;
      }
    }
  } else if (bundle.state.phase === "ORAL_DEFENSE") {
    complete = await allRequiredDefensesSubmitted(ctx, round._id);
  } else if (bundle.state.phase === "PROCTOR_REVIEW_VOTE") {
    complete = (await listSuspensionVotes(ctx, bundle.game._id)).length === participants.length;
  } else if (bundle.state.phase === "FINAL_ACCUSATION") {
    complete = (await listAccusations(ctx, bundle.game._id)).length === participants.length;
  }
  if (!complete) return null;
  return forceAdvanceQuizslop(ctx, bundle, now);
}

export { requiredDefensePlayers };
