import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { listEligibility, listQuizslopParticipants, listSourcesForQuestion } from "./quizslopData";
import { validateQuestionContent } from "../src/games/quizslop/content-validation";

export interface QuizslopQuestionGroupAudit {
  questionById: ReadonlyMap<Id<"quizSlopQuestions">, Doc<"quizSlopQuestions">>;
  systemVoidQuestionIds: readonly Id<"quizSlopQuestions">[];
}

function sameIds<T extends string>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function assignmentIsComplete(
  assignment: Doc<"quizSlopAssignments">,
  question: Doc<"quizSlopQuestions">,
  gameId: Id<"games">,
  roundId: Id<"quizSlopRounds">,
  eligiblePlayerIds: ReadonlySet<Id<"players">>,
): boolean {
  const hasValidAnswerState =
    assignment.lockedAt === undefined
      ? assignment.selectedIndex === undefined
      : Number.isInteger(assignment.selectedIndex) &&
        assignment.selectedIndex !== undefined &&
        assignment.selectedIndex >= 0 &&
        assignment.selectedIndex < question.choices.length &&
        assignment.timedOut !== true;

  return (
    assignment.gameId === gameId &&
    assignment.roundId === roundId &&
    eligiblePlayerIds.has(assignment.playerId) &&
    assignment.questionId === question._id &&
    assignment.tierAtAssignment === question.tier &&
    hasValidAnswerState
  );
}

/**
 * Revalidates the frozen question groups at reveal and settlement boundaries.
 * Any ownership, roster, question, source, key, or locked-answer inconsistency
 * voids the whole affected group so corrupt state can never score.
 */
export async function auditQuestionGroups(
  ctx: MutationCtx,
  gameId: Id<"games">,
  round: Doc<"quizSlopRounds">,
  assignments: readonly Doc<"quizSlopAssignments">[],
  expectedQuestionIds?: readonly Id<"quizSlopQuestions">[],
): Promise<QuizslopQuestionGroupAudit> {
  const assignmentQuestionIds = new Set(assignments.map((assignment) => assignment.questionId));
  const frozenQuestionIds = new Set(expectedQuestionIds ?? assignmentQuestionIds);
  const questionIds = [...new Set([...assignmentQuestionIds, ...frozenQuestionIds])];
  const [eligibility, participants, questionEntries] = await Promise.all([
    listEligibility(ctx, round._id, "ANSWER"),
    listQuizslopParticipants(ctx, gameId),
    Promise.all(
      questionIds.map(async (questionId) => {
        const [question, sources] = await Promise.all([
          ctx.db.get("quizSlopQuestions", questionId),
          listSourcesForQuestion(ctx, questionId),
        ]);
        return { questionId, question, sources };
      }),
    ),
  ]);

  const participantIds = new Set(participants.map((participant) => participant.playerId));
  const eligiblePlayerIds = new Set(eligibility.map((entry) => entry.playerId));
  const assignmentCountByPlayer = new Map<Id<"players">, number>();
  for (const assignment of assignments) {
    assignmentCountByPlayer.set(
      assignment.playerId,
      (assignmentCountByPlayer.get(assignment.playerId) ?? 0) + 1,
    );
  }
  const rosterIsComplete =
    assignments.length === eligiblePlayerIds.size &&
    [...eligiblePlayerIds].every(
      (playerId) => assignmentCountByPlayer.get(playerId) === 1 && participantIds.has(playerId),
    ) &&
    assignments.every((assignment) => eligiblePlayerIds.has(assignment.playerId));
  const revealSetIsComplete =
    expectedQuestionIds === undefined || sameIds(assignmentQuestionIds, frozenQuestionIds);

  const questionById = new Map<Id<"quizSlopQuestions">, Doc<"quizSlopQuestions">>();
  const systemVoidQuestionIds: Id<"quizSlopQuestions">[] = [];
  for (const { questionId, question, sources } of questionEntries) {
    if (question) questionById.set(questionId, question);
    const questionIsComplete =
      question !== null &&
      question.gameId === gameId &&
      question.topicId === round.topicId &&
      sources.every((source) => source.gameId === gameId && source.questionId === questionId) &&
      validateQuestionContent({
        id: questionId,
        tier: question.tier,
        neutralQuestion: question.neutralQuestion,
        displayPrompt: question.displayPrompt,
        choices: question.choices,
        correctIndex: question.correctIndex,
        canonicalFact: question.canonicalFact,
        explanation: question.explanation,
        comedyDevices: question.comedyDevices,
        sources: sources.map((source) => ({
          url: source.url,
          title: source.title,
          locator: source.locator,
          retrievedAt: source.retrievedAt,
          contentHash: source.contentHash,
          supportExcerpt: source.supportExcerpt,
          primary: source.primary,
        })),
      }).length === 0;
    const groupAssignments = assignments.filter(
      (assignment) => assignment.questionId === questionId,
    );
    const assignmentsAreComplete =
      question !== null &&
      groupAssignments.length > 0 &&
      groupAssignments.every((assignment) =>
        assignmentIsComplete(assignment, question, gameId, round._id, eligiblePlayerIds),
      );

    if (
      !rosterIsComplete ||
      !revealSetIsComplete ||
      !questionIsComplete ||
      !assignmentsAreComplete
    ) {
      systemVoidQuestionIds.push(questionId);
    }
  }

  return { questionById, systemVoidQuestionIds };
}
