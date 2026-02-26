import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getModelByModelId } from "@/lib/models";
import { computeLeaderboardPromptAnalytics, type LeaderboardApiResponse, type ModelUsageStats } from "@/lib/leaderboard-analytics";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";

const LEADERBOARD_AGGREGATE_ID = "global";
const LEADERBOARD_AGGREGATE_SELECT = {
  leaderboard: true,
  headToHead: true,
  bestResponses: true,
  modelUsage: true,
  stats: true,
} satisfies Prisma.LeaderboardAggregateSelect;

const emptyData: LeaderboardApiResponse = {
  leaderboard: [],
  headToHead: [],
  bestResponses: [],
  modelUsage: [],
  stats: { totalGames: 0, totalPrompts: 0, totalVotes: 0, totalTokens: 0, totalCost: 0 },
};

type ContestantTotals = LeaderboardApiResponse["leaderboard"][number];
type HeadToHeadTotals = LeaderboardApiResponse["headToHead"][number];
type BestResponse = LeaderboardApiResponse["bestResponses"][number];
type Stats = LeaderboardApiResponse["stats"];

type CompletedGamePrompt = {
  id: string;
  text: string;
  responses: Array<{
    id: string;
    text: string;
    player: { type: string; modelId: string | null; name: string };
    _count: { votes: number };
  }>;
  _count: { votes: number };
};

function cloneEmpty(): LeaderboardApiResponse {
  return {
    leaderboard: [],
    headToHead: [],
    bestResponses: [],
    modelUsage: [],
    stats: { ...emptyData.stats },
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function coerceAggregateRow(row: {
  leaderboard: unknown;
  headToHead: unknown;
  bestResponses: unknown;
  modelUsage: unknown;
  stats: unknown;
} | null): LeaderboardApiResponse | null {
  if (!row) return null;
  return {
    leaderboard: Array.isArray(row.leaderboard) ? (row.leaderboard as ContestantTotals[]) : [],
    headToHead: Array.isArray(row.headToHead) ? (row.headToHead as HeadToHeadTotals[]) : [],
    bestResponses: Array.isArray(row.bestResponses) ? (row.bestResponses as BestResponse[]) : [],
    modelUsage: Array.isArray(row.modelUsage) ? (row.modelUsage as ModelUsageStats[]) : [],
    stats: (row.stats as Stats) ?? { ...emptyData.stats },
  };
}

function mergeModelUsage(existing: ModelUsageStats[], incoming: ModelUsageStats[]): ModelUsageStats[] {
  const map = new Map(existing.map((x) => [x.modelId, { ...x }]));
  for (const row of incoming) {
    const prev = map.get(row.modelId);
    if (prev) {
      prev.inputTokens += row.inputTokens;
      prev.outputTokens += row.outputTokens;
      prev.costUsd += row.costUsd;
      continue;
    }
    map.set(row.modelId, { ...row });
  }
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
}

function mergeLeaderboard(existing: ContestantTotals[], incoming: ContestantTotals[], totalVotes: number): ContestantTotals[] {
  const map = new Map(existing.map((x) => [x.key, { ...x }]));
  for (const row of incoming) {
    const prev = map.get(row.key);
    if (prev) {
      prev.totalVotes += row.totalVotes;
      prev.totalResponses += row.totalResponses;
      prev.matchupsWon += row.matchupsWon;
      prev.matchupsPlayed += row.matchupsPlayed;
      prev.winRate = 0;
      prev.voteShare = 0;
      continue;
    }
    map.set(row.key, { ...row, winRate: 0, voteShare: 0 });
  }

  for (const row of map.values()) {
    row.winRate = row.matchupsPlayed > 0 ? Math.round((row.matchupsWon / row.matchupsPlayed) * 100) : 0;
    row.voteShare = totalVotes > 0 ? Math.round((row.totalVotes / totalVotes) * 100) : 0;
  }

  return [...map.values()]
    .filter((row) => row.totalResponses > 0)
    .sort((a, b) => b.totalVotes - a.totalVotes);
}

function mergeHeadToHead(existing: HeadToHeadTotals[], incoming: HeadToHeadTotals[]): HeadToHeadTotals[] {
  const map = new Map(existing.map((x) => [x.modelId, { ...x }]));
  for (const row of incoming) {
    const prev = map.get(row.modelId);
    if (prev) {
      prev.humanWins += row.humanWins;
      prev.aiWins += row.aiWins;
      prev.ties += row.ties;
      prev.total += row.total;
      continue;
    }
    map.set(row.modelId, { ...row });
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function mergeBestResponses(existing: BestResponse[], incoming: BestResponse[]): BestResponse[] {
  return [...existing, ...incoming]
    .filter((response) => response.totalVotes >= 2)
    .sort((a, b) => b.votePct - a.votePct || b.voteCount - a.voteCount)
    .slice(0, 5);
}

function mergeAggregate(base: LeaderboardApiResponse, delta: LeaderboardApiResponse): LeaderboardApiResponse {
  const stats: Stats = {
    totalGames: base.stats.totalGames + delta.stats.totalGames,
    totalPrompts: base.stats.totalPrompts + delta.stats.totalPrompts,
    totalVotes: base.stats.totalVotes + delta.stats.totalVotes,
    totalTokens: base.stats.totalTokens + delta.stats.totalTokens,
    totalCost: base.stats.totalCost + delta.stats.totalCost,
  };

  return {
    leaderboard: mergeLeaderboard(base.leaderboard, delta.leaderboard, stats.totalVotes),
    headToHead: mergeHeadToHead(base.headToHead, delta.headToHead),
    bestResponses: mergeBestResponses(base.bestResponses, delta.bestResponses),
    modelUsage: mergeModelUsage(base.modelUsage, delta.modelUsage),
    stats,
  };
}

async function buildFullLeaderboardSnapshot(): Promise<LeaderboardApiResponse> {
  const totalGames = await prisma.game.count({ where: { status: "FINAL_RESULTS" } });
  if (totalGames === 0) return cloneEmpty();

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
      where: { round: { game: { status: "FINAL_RESULTS" } } },
      select: {
        id: true,
        text: true,
        responses: {
          select: {
            id: true,
            text: true,
            player: { select: { type: true, modelId: true, name: true } },
            _count: { select: { votes: true } },
          },
        },
        _count: { select: { votes: true } },
      },
    }),
    prisma.vote.count({
      where: {
        prompt: { round: { game: { status: "FINAL_RESULTS" } } },
        NOT: { responseId: null },
      },
    }),
  ]);

  const { leaderboard, headToHead, bestResponses } = computeLeaderboardPromptAnalytics(prompts, totalVotes);
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
}

async function buildDeltaForCompletedGame(gameId: string): Promise<LeaderboardApiResponse | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      status: true,
      rounds: {
        select: {
          prompts: {
            select: {
              id: true,
              text: true,
              responses: {
                select: {
                  id: true,
                  text: true,
                  player: { select: { type: true, modelId: true, name: true } },
                  _count: { select: { votes: true } },
                },
              },
              _count: { select: { votes: true } },
            },
          },
        },
      },
      modelUsages: {
        select: { modelId: true, inputTokens: true, outputTokens: true, costUsd: true },
      },
    },
  });

  if (!game || game.status !== "FINAL_RESULTS") return null;

  const prompts: CompletedGamePrompt[] = game.rounds.flatMap((r) => r.prompts);
  const totalVotes = prompts.reduce(
    (sum, prompt) => sum + prompt.responses.reduce((inner, response) => inner + response._count.votes, 0),
    0,
  );

  const { leaderboard, headToHead, bestResponses } = computeLeaderboardPromptAnalytics(prompts, totalVotes);

  const modelUsage = game.modelUsages
    .flatMap((row) => {
      const model = getModelByModelId(row.modelId);
      if (!model) return [];
      return [{
        modelId: row.modelId,
        modelName: model.name,
        modelShortName: model.shortName,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        costUsd: row.costUsd,
      }];
    })
    .sort((a, b) => b.costUsd - a.costUsd);

  const totalTokens = modelUsage.reduce((s, m) => s + m.inputTokens + m.outputTokens, 0);
  const totalCost = modelUsage.reduce((s, m) => s + m.costUsd, 0);

  return {
    leaderboard,
    headToHead,
    bestResponses,
    modelUsage,
    stats: {
      totalGames: 1,
      totalPrompts: prompts.length,
      totalVotes,
      totalTokens,
      totalCost,
    },
  };
}

export async function getLeaderboardAggregateOrSeed(): Promise<LeaderboardApiResponse> {
  const row = await prisma.leaderboardAggregate.findUnique({
    where: { id: LEADERBOARD_AGGREGATE_ID },
    select: LEADERBOARD_AGGREGATE_SELECT,
  });
  const existing = coerceAggregateRow(row);
  if (existing) return existing;

  const snapshot = await buildFullLeaderboardSnapshot();
  await prisma.leaderboardAggregate.upsert({
    where: { id: LEADERBOARD_AGGREGATE_ID },
    create: {
      id: LEADERBOARD_AGGREGATE_ID,
      leaderboard: asJson(snapshot.leaderboard),
      headToHead: asJson(snapshot.headToHead),
      bestResponses: asJson(snapshot.bestResponses),
      modelUsage: asJson(snapshot.modelUsage),
      stats: asJson(snapshot.stats),
    },
    update: {
      leaderboard: asJson(snapshot.leaderboard),
      headToHead: asJson(snapshot.headToHead),
      bestResponses: asJson(snapshot.bestResponses),
      modelUsage: asJson(snapshot.modelUsage),
      stats: asJson(snapshot.stats),
    },
  });
  return snapshot;
}

export async function applyCompletedGameToLeaderboardAggregate(gameId: string): Promise<void> {
  const aggregateRow = await prisma.leaderboardAggregate.findUnique({
    where: { id: LEADERBOARD_AGGREGATE_ID },
    select: LEADERBOARD_AGGREGATE_SELECT,
  });
  const current = coerceAggregateRow(aggregateRow);
  if (!current) return;

  const delta = await buildDeltaForCompletedGame(gameId);
  if (!delta) return;

  try {
    await prisma.leaderboardProcessedGame.create({ data: { gameId } });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2002")) return;
    throw error;
  }

  const next = mergeAggregate(current, delta);

  await prisma.leaderboardAggregate.update({
    where: { id: LEADERBOARD_AGGREGATE_ID },
    data: {
      leaderboard: asJson(next.leaderboard),
      headToHead: asJson(next.headToHead),
      bestResponses: asJson(next.bestResponses),
      modelUsage: asJson(next.modelUsage),
      stats: asJson(next.stats),
    },
  });
}
