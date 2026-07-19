import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { listSourcesForQuestion } from "./quizslopData";
import { validateQuestionContent } from "../src/games/quizslop/content-validation";
import type { QuizslopTier } from "../src/games/quizslop/types";

/**
 * Revalidates the immutable question and its retained evidence at every
 * gameplay boundary that consumes the answer key. This is intentionally the
 * same deterministic contract used by catalog and pack validation.
 */
export async function assertFrozenQuestionIntegrity(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    topicId: Id<"quizSlopTopics">;
    expectedTier?: QuizslopTier;
    question: Doc<"quizSlopQuestions">;
  },
): Promise<void> {
  const { question } = args;
  const sources = await listSourcesForQuestion(ctx, question._id);
  const ownershipIsValid =
    question.gameId === args.gameId &&
    question.topicId === args.topicId &&
    (args.expectedTier === undefined || question.tier === args.expectedTier) &&
    sources.every((source) => source.gameId === args.gameId && source.questionId === question._id);
  const contentIssues = validateQuestionContent({
    id: question._id,
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
  });
  if (!ownershipIsValid || contentIssues.length > 0) {
    throw new ConvexError("The frozen QuizSlop question failed its integrity check");
  }
}
