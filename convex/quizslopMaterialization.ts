import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { listQuestionsForTopic, listSourcesForQuestion } from "./quizslopData";
import type { QuizslopCatalogTopic } from "../src/games/quizslop/types";
import { isShippableCatalogTopic } from "../src/games/quizslop/catalog";

/** Materializes one reviewed catalog topic into game-owned frozen records. */
export async function materializeCatalogTopic(
  ctx: MutationCtx,
  gameId: Id<"games">,
  catalogTopic: QuizslopCatalogTopic,
  options: {
    ownerPlayerId?: Id<"players">;
    deckRole?: Doc<"quizSlopTopics">["deckRole"];
    setupState: Doc<"quizSlopTopics">["setupState"];
    selectionRank?: number;
    tieBreakRank?: number;
    slateDisplayOrder?: number;
    now: number;
  },
): Promise<Id<"quizSlopTopics">> {
  if (!isShippableCatalogTopic(catalogTopic)) {
    throw new ConvexError("Catalog topic is not fully human-approved for play");
  }
  const topicId = await ctx.db.insert("quizSlopTopics", {
    gameId,
    ...(options.ownerPlayerId ? { ownerPlayerId: options.ownerPlayerId } : {}),
    sourceType: "CATALOG",
    catalogTopicId: catalogTopic.id,
    packVersion: catalogTopic.packVersion,
    revision: 0,
    label: catalogTopic.label,
    scope: catalogTopic.scope,
    category: catalogTopic.category,
    exclusions: [...catalogTopic.exclusions],
    canonicalKey: catalogTopic.canonicalKey,
    setupState: options.setupState,
    ...(options.deckRole ? { deckRole: options.deckRole } : {}),
    ...(options.selectionRank !== undefined ? { selectionRank: options.selectionRank } : {}),
    ...(options.tieBreakRank !== undefined ? { tieBreakRank: options.tieBreakRank } : {}),
    ...(options.slateDisplayOrder !== undefined
      ? { slateDisplayOrder: options.slateDisplayOrder }
      : {}),
    updatedAt: options.now,
  });
  await Promise.all(
    catalogTopic.questions.map(async (question) => {
      const questionId = await ctx.db.insert("quizSlopQuestions", {
        gameId,
        topicId,
        tier: question.tier,
        neutralQuestion: question.neutralQuestion,
        displayPrompt: question.displayPrompt,
        choices: [...question.choices],
        correctIndex: question.correctIndex,
        canonicalFact: question.canonicalFact,
        explanation: question.explanation,
        comedyDevices: [...question.comedyDevices],
        provenance: {
          catalogTopicId: catalogTopic.id,
          packVersion: catalogTopic.packVersion,
          generatorModelId: null,
          verifierModelId: null,
          promptVersion: null,
          generatedAt: null,
        },
      });
      await Promise.all(
        question.sources.map((source) =>
          ctx.db.insert("quizSlopQuestionSources", {
            gameId,
            questionId,
            url: source.url,
            title: source.title,
            locator: source.locator,
            retrievedAt: source.retrievedAt,
            contentHash: source.contentHash,
            supportExcerpt: source.supportExcerpt,
            primary: source.primary,
          }),
        ),
      );
    }),
  );
  return topicId;
}

/** Removes a game-owned topic and its bounded question/source tree. */
export async function deleteMaterializedTopic(
  ctx: MutationCtx,
  topic: Doc<"quizSlopTopics">,
): Promise<void> {
  const questions = await listQuestionsForTopic(ctx, topic._id);
  const sourcesByQuestion = await Promise.all(
    questions.map((question) => listSourcesForQuestion(ctx, question._id)),
  );
  await Promise.all(
    sourcesByQuestion.flatMap((sources) =>
      sources.map((source) => ctx.db.delete("quizSlopQuestionSources", source._id)),
    ),
  );
  await Promise.all(questions.map((question) => ctx.db.delete("quizSlopQuestions", question._id)));
  await ctx.db.delete("quizSlopTopics", topic._id);
}
