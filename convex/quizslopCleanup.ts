import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/** Loads one bounded deletion batch from every QuizSlop-owned table. */
export async function loadQuizslopCleanupRows(
  ctx: MutationCtx,
  gameId: Id<"games">,
  limit: number,
) {
  const [
    scoreEvents,
    disputeVotes,
    disputes,
    assignments,
    calls,
    houseVotes,
    eligibility,
    questionSources,
    questions,
    rounds,
    topics,
    participants,
    states,
  ] = await Promise.all([
    ctx.db
      .query("quizSlopScoreEvents")
      .withIndex("by_gameId_and_key", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopDisputeVotes")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopDisputes")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopAssignments")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopCalls")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopHouseVotes")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopEligibility")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopQuestionSources")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopQuestions")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopRounds")
      .withIndex("by_gameId_and_deckOrdinal", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopTopics")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopParticipants")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopState")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
  ]);
  return {
    scoreEvents,
    disputeVotes,
    disputes,
    assignments,
    calls,
    houseVotes,
    eligibility,
    questionSources,
    questions,
    rounds,
    topics,
    participants,
    states,
  };
}

export type QuizslopCleanupRows = Awaited<ReturnType<typeof loadQuizslopCleanupRows>>;

export function hasMoreQuizslopCleanupRows(rows: QuizslopCleanupRows, batchSize: number): boolean {
  return Object.values(rows).some((tableRows) => tableRows.length > batchSize);
}

/**
 * Deletes children before their parents so every batch remains referentially
 * coherent. Deletes within one table are independent, so each table's batch is
 * issued in parallel while the table ordering itself stays sequential.
 */
export async function deleteQuizslopCleanupRows(
  ctx: MutationCtx,
  rows: QuizslopCleanupRows,
  batchSize: number,
): Promise<void> {
  await Promise.all(
    rows.scoreEvents
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopScoreEvents", row._id)),
  );
  await Promise.all(
    rows.disputeVotes
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopDisputeVotes", row._id)),
  );
  await Promise.all(
    rows.disputes.slice(0, batchSize).map((row) => ctx.db.delete("quizSlopDisputes", row._id)),
  );
  await Promise.all(
    rows.assignments
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopAssignments", row._id)),
  );
  await Promise.all(
    rows.calls.slice(0, batchSize).map((row) => ctx.db.delete("quizSlopCalls", row._id)),
  );
  await Promise.all(
    rows.houseVotes.slice(0, batchSize).map((row) => ctx.db.delete("quizSlopHouseVotes", row._id)),
  );
  await Promise.all(
    rows.eligibility
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopEligibility", row._id)),
  );
  await Promise.all(
    rows.questionSources
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopQuestionSources", row._id)),
  );
  await Promise.all(
    rows.questions.slice(0, batchSize).map((row) => ctx.db.delete("quizSlopQuestions", row._id)),
  );
  await Promise.all(
    rows.rounds.slice(0, batchSize).map((row) => ctx.db.delete("quizSlopRounds", row._id)),
  );
  await Promise.all(
    rows.topics.slice(0, batchSize).map((row) => ctx.db.delete("quizSlopTopics", row._id)),
  );
  await Promise.all(
    rows.participants
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopParticipants", row._id)),
  );
  await Promise.all(
    rows.states.slice(0, batchSize).map((row) => ctx.db.delete("quizSlopState", row._id)),
  );
}
