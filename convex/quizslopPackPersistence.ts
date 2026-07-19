import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type {
  QuizSlopFrozenPack,
  QuizSlopModelUsage,
} from "../src/games/quizslop/content-source/contracts";

async function addPackUsage(
  ctx: MutationCtx,
  game: Doc<"games">,
  usageRows: readonly QuizSlopModelUsage[],
  now: number,
): Promise<void> {
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  for (const usage of usageRows) {
    const current = byModel.get(usage.actualModelId) ?? {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    current.inputTokens += usage.inputTokens;
    current.outputTokens += usage.outputTokens;
    current.costUsd += usage.costUsd;
    byModel.set(usage.actualModelId, current);
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    costUsd += usage.costUsd;
  }
  await Promise.all(
    [...byModel].map(async ([modelId, usage]) => {
      const existing = await ctx.db
        .query("gameModelUsage")
        .withIndex("by_gameId_and_modelId", (index) =>
          index.eq("gameId", game._id).eq("modelId", modelId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("gameModelUsage", existing._id, {
          inputTokens: existing.inputTokens + usage.inputTokens,
          outputTokens: existing.outputTokens + usage.outputTokens,
          costUsd: existing.costUsd + usage.costUsd,
        });
        return;
      }
      await ctx.db.insert("gameModelUsage", { gameId: game._id, modelId, ...usage });
    }),
  );
  await ctx.db.patch("games", game._id, {
    aiInputTokens: game.aiInputTokens + inputTokens,
    aiOutputTokens: game.aiOutputTokens + outputTokens,
    aiCostUsd: game.aiCostUsd + costUsd,
    updatedAt: now,
  });
}

export async function gameHasQuizSlopPackRows(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<boolean> {
  const [topics, questions, sources] = await Promise.all([
    ctx.db
      .query("quizSlopTopics")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(1),
    ctx.db
      .query("quizSlopQuestions")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(1),
    ctx.db
      .query("quizSlopQuestionSources")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(1),
  ]);
  return topics.length > 0 || questions.length > 0 || sources.length > 0;
}

async function materializePack(
  ctx: MutationCtx,
  gameId: Id<"games">,
  pack: QuizSlopFrozenPack,
): Promise<void> {
  await Promise.all(
    pack.banks.map(async (bank) => {
      const topicId = await ctx.db.insert("quizSlopTopics", {
        gameId,
        catalogTopicId: bank.topic.id,
        packVersion: bank.topic.packVersion,
        label: bank.topic.label,
        scope: bank.topic.scope,
        category: bank.topic.category,
        exclusions: [...bank.topic.exclusions],
        canonicalKey: bank.topic.canonicalKey,
      });
      await Promise.all(
        bank.questions.map(async (question) => {
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
              catalogTopicId: bank.topic.id,
              packVersion: bank.topic.packVersion,
              generatorModelId: pack.generatorModelId,
              verifierModelId: pack.verifierModelId,
              promptVersion: pack.source === "AI" ? pack.promptVersion : null,
              generatedAt: pack.source === "AI" ? new Date(pack.frozenAt).toISOString() : null,
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
    }),
  );
}

export async function persistQuizSlopPack(
  ctx: MutationCtx,
  args: { game: Doc<"games">; pack: QuizSlopFrozenPack; now: number },
): Promise<void> {
  await Promise.all([
    materializePack(ctx, args.game._id, args.pack),
    addPackUsage(ctx, args.game, args.pack.usage, args.now),
  ]);
}
