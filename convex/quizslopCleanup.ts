import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export async function loadQuizslopCleanupRows(
  ctx: MutationCtx,
  gameId: Id<"games">,
  limit: number,
) {
  const [
    groupAnswers,
    defenses,
    suspensionVotes,
    accusations,
    assignments,
    questionSources,
    questions,
    rounds,
    topics,
    participants,
    states,
  ] = await Promise.all([
    ctx.db
      .query("quizSlopGroupAnswers")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopDefenses")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopSuspensionVotes")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopAccusations")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(limit),
    ctx.db
      .query("quizSlopAssignments")
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
      .withIndex("by_gameId_and_sectionIndex", (index) => index.eq("gameId", gameId))
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
    groupAnswers,
    defenses,
    suspensionVotes,
    accusations,
    assignments,
    questionSources,
    questions,
    rounds,
    topics,
    participants,
    states,
  };
}

type QuizslopCleanupRows = Awaited<ReturnType<typeof loadQuizslopCleanupRows>>;

export function hasMoreQuizslopCleanupRows(rows: QuizslopCleanupRows, batchSize: number): boolean {
  return Object.values(rows).some((tableRows) => tableRows.length > batchSize);
}

export async function deleteQuizslopCleanupRows(
  ctx: MutationCtx,
  rows: QuizslopCleanupRows,
  batchSize: number,
): Promise<void> {
  await Promise.all(
    rows.groupAnswers
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopGroupAnswers", row._id)),
  );
  await Promise.all(
    rows.defenses.slice(0, batchSize).map((row) => ctx.db.delete("quizSlopDefenses", row._id)),
  );
  await Promise.all(
    rows.suspensionVotes
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopSuspensionVotes", row._id)),
  );
  await Promise.all(
    rows.accusations
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopAccusations", row._id)),
  );
  await Promise.all(
    rows.assignments
      .slice(0, batchSize)
      .map((row) => ctx.db.delete("quizSlopAssignments", row._id)),
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
