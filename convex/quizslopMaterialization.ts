import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { QuizslopCatalogTopic } from "../src/games/quizslop/types";

type QuizslopWriteCtx = Pick<MutationCtx, "db">;

/** Materializes one reviewed catalog topic into immutable game-owned records. */
export async function materializeCatalogTopic(
  ctx: QuizslopWriteCtx,
  gameId: Id<"games">,
  catalogTopic: QuizslopCatalogTopic,
): Promise<Id<"quizSlopTopics">> {
  const topicId = await ctx.db.insert("quizSlopTopics", {
    gameId,
    catalogTopicId: catalogTopic.id,
    packVersion: catalogTopic.packVersion,
    label: catalogTopic.label,
    scope: catalogTopic.scope,
    category: catalogTopic.category,
    exclusions: [...catalogTopic.exclusions],
    canonicalKey: catalogTopic.canonicalKey,
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
