import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { LEADERBOARD_TAG } from "@/lib/game-constants";
import { getModelByModelId } from "@/lib/models";
import type { LeaderboardApiResponse } from "@/lib/leaderboard-analytics";
import { computeLeaderboardPromptAnalytics } from "@/lib/leaderboard-analytics";

const emptyData: LeaderboardApiResponse = {
  leaderboard: [],
  headToHead: [],
  bestResponses: [],
  modelUsage: [],
  stats: { totalGames: 0, totalPrompts: 0, totalVotes: 0, totalTokens: 0, totalCost: 0 },
};

/** Cached leaderboard computation. Revalidated via tag when games finish, plus 60s TTL. */
const getLeaderboardData = unstable_cache(
  async () => {
    // Quick check: if no completed games, return empty data immediately
    const totalGames = await prisma.game.count({ where: { status: "FINAL_RESULTS" } });
    if (totalGames === 0) {
      return emptyData;
    }

    // Aggregate token usage per model across completed games
    const modelUsageRaw = await prisma.gameModelUsage.groupBy({
      by: ["modelId"],
      where: { game: { status: "FINAL_RESULTS" } },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
    });

    const modelUsage = modelUsageRaw
      .flatMap((row) => {
        const model = getModelByModelId(row.modelId);
        if (!model) return [];
        return [{
          modelId: row.modelId,
          modelName: model.name,
          modelShortName: model.shortName,
          inputTokens: row._sum.inputTokens ?? 0,
          outputTokens: row._sum.outputTokens ?? 0,
          costUsd: row._sum.costUsd ?? 0,
        }];
      })
      .sort((a, b) => b.costUsd - a.costUsd);

    const totalTokens = modelUsage.reduce((s, m) => s + m.inputTokens + m.outputTokens, 0);
    const totalCost = modelUsage.reduce((s, m) => s + m.costUsd, 0);

    const [prompts, totalVotes] = await Promise.all([
      prisma.prompt.findMany({
        where: {
          round: {
            game: { status: "FINAL_RESULTS" },
          },
        },
        select: {
          id: true,
          text: true,
          responses: {
            select: {
              id: true,
              text: true,
              player: {
                select: {
                  type: true,
                  modelId: true,
                  name: true,
                },
              },
              _count: {
                select: { votes: true },
              },
            },
          },
          _count: {
            select: { votes: true },
          },
        },
      }),
      prisma.vote.count({
        where: {
          prompt: { round: { game: { status: "FINAL_RESULTS" } } },
          NOT: { responseId: null },
        },
      }),
    ]);

    const { leaderboard, headToHead, bestResponses } = computeLeaderboardPromptAnalytics(
      prompts,
      totalVotes,
    );

    return {
      leaderboard,
      headToHead,
      bestResponses,
      modelUsage,
      stats: {
        totalGames,
        totalPrompts: prompts.length,
        totalVotes,
        totalTokens,
        totalCost,
      },
    };
  },
  [LEADERBOARD_TAG],
  { revalidate: 60, tags: [LEADERBOARD_TAG] }
);

export async function GET() {
  try {
    const data = await getLeaderboardData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Leaderboard fetch error:", error);
    return NextResponse.json(emptyData);
  }
}
