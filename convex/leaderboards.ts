import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { getModelByModelId } from "../src/lib/models";
import { loadPlayers } from "./roster";
import { isForfeit, loadAllRounds, responsesFor } from "./rounds";

const LEADERBOARD_GAME_TYPE = "SLOPLASH" as const;
const MAX_MODEL_USAGES = 64;
const MAX_LEADERBOARD_ENTRIES = 64;
const MAX_HEAD_TO_HEAD_ROWS = 128;
const MAX_MODEL_USAGE_ROWS = 128;
const BEST_RESPONSE_LIMIT = 5;

type CompetitorDelta = {
  competitorKey: string;
  displayName: string;
  shortName: string;
  type: "HUMAN" | "AI";
  modelId?: string;
  totalVotes: number;
  totalResponses: number;
  matchupsWon: number;
  matchupsPlayed: number;
};

type HeadToHeadDelta = {
  modelId: string;
  humanWins: number;
  aiWins: number;
  ties: number;
};

type BestResponseDelta = {
  promptId: Id<"prompts">;
  responseId: Id<"responses">;
  competitorKey: string;
  promptText: string;
  responseText: string;
  playerName: string;
  playerType: "HUMAN" | "AI";
  modelId?: string;
  votePct: number;
  voteCount: number;
  totalVotes: number;
};

type GameProjection = {
  competitors: Map<string, CompetitorDelta>;
  headToHead: Map<string, HeadToHeadDelta>;
  bestResponses: BestResponseDelta[];
  modelUsages: Doc<"gameModelUsage">[];
  totalPlayers: number;
  totalPrompts: number;
  totalVotes: number;
  totalTokens: number;
  totalCost: number;
};

const contestantValidator = v.object({
  key: v.string(),
  name: v.string(),
  shortName: v.string(),
  type: v.union(v.literal("HUMAN"), v.literal("AI")),
  modelId: v.union(v.string(), v.null()),
  totalVotes: v.number(),
  totalResponses: v.number(),
  matchupsWon: v.number(),
  matchupsPlayed: v.number(),
  winRate: v.number(),
  voteShare: v.number(),
});

const headToHeadValidator = v.object({
  modelId: v.string(),
  modelName: v.string(),
  modelShortName: v.string(),
  humanWins: v.number(),
  aiWins: v.number(),
  ties: v.number(),
  total: v.number(),
});

const bestResponseValidator = v.object({
  promptText: v.string(),
  responseText: v.string(),
  playerName: v.string(),
  playerType: v.union(v.literal("HUMAN"), v.literal("AI")),
  modelId: v.union(v.string(), v.null()),
  votePct: v.number(),
  voteCount: v.number(),
  totalVotes: v.number(),
});

const modelUsageValidator = v.object({
  modelId: v.string(),
  modelName: v.string(),
  modelShortName: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  costUsd: v.number(),
});

const statsValidator = v.object({
  totalGames: v.number(),
  totalPrompts: v.number(),
  totalVotes: v.number(),
  totalTokens: v.number(),
  totalCost: v.number(),
});

/** Catalog names; a model since dropped from the catalog keeps its id. */
function modelNames(modelId: string): { displayName: string; shortName: string } {
  const model = getModelByModelId(modelId);
  return {
    displayName: model?.name ?? modelId,
    shortName: model?.shortName ?? modelId,
  };
}

function competitorIdentity(player: Doc<"players">): {
  key: string;
  displayName: string;
  shortName: string;
  type: "HUMAN" | "AI";
  modelId?: string;
} {
  if (player.type !== "AI" || !player.modelId) {
    return {
      key: "HUMAN",
      displayName: "Humans",
      shortName: "Human",
      type: "HUMAN",
    };
  }
  const names = modelNames(player.modelId);
  return {
    key: player.modelId,
    displayName: names.displayName,
    shortName: names.shortName,
    type: "AI",
    modelId: player.modelId,
  };
}

function getCompetitor(
  competitors: Map<string, CompetitorDelta>,
  player: Doc<"players">,
): CompetitorDelta {
  const identity = competitorIdentity(player);
  const existing = competitors.get(identity.key);
  if (existing) return existing;
  const created: CompetitorDelta = {
    competitorKey: identity.key,
    displayName: identity.displayName,
    shortName: identity.shortName,
    type: identity.type,
    ...(identity.modelId ? { modelId: identity.modelId } : {}),
    totalVotes: 0,
    totalResponses: 0,
    matchupsWon: 0,
    matchupsPlayed: 0,
  };
  competitors.set(identity.key, created);
  return created;
}

function getHeadToHead(rows: Map<string, HeadToHeadDelta>, modelId: string): HeadToHeadDelta {
  const existing = rows.get(modelId);
  if (existing) return existing;
  const created = { modelId, humanWins: 0, aiWins: 0, ties: 0 };
  rows.set(modelId, created);
  return created;
}

async function buildProjection(ctx: MutationCtx, game: Doc<"games">): Promise<GameProjection> {
  const [players, rounds, modelUsages] = await Promise.all([
    loadPlayers(ctx, game._id),
    loadAllRounds(ctx, game._id),
    ctx.db
      .query("gameModelUsage")
      .withIndex("by_gameId_and_modelId", (index) => index.eq("gameId", game._id))
      .take(MAX_MODEL_USAGES),
  ]);
  const playersById = new Map(players.map((player) => [player._id, player]));
  const competitors = new Map<string, CompetitorDelta>();
  const headToHead = new Map<string, HeadToHeadDelta>();
  const bestResponses: BestResponseDelta[] = [];
  let totalPrompts = 0;
  let totalVotes = 0;

  for (const bundle of rounds) {
    if (bundle.round.scoredAt === undefined) continue;
    const { prompts } = bundle;
    totalPrompts += prompts.length;
    const voteCounts = new Map<Id<"responses">, number>();
    // Human vs AI is judged by people only: AI ballots never decide it.
    const humanVoteCounts = new Map<Id<"responses">, number>();
    for (const vote of bundle.votes) {
      if (!vote.responseId) continue;
      voteCounts.set(vote.responseId, (voteCounts.get(vote.responseId) ?? 0) + 1);
      if (playersById.get(vote.voterId)?.type === "HUMAN") {
        humanVoteCounts.set(vote.responseId, (humanVoteCounts.get(vote.responseId) ?? 0) + 1);
      }
      totalVotes += 1;
    }

    for (const prompt of prompts) {
      const promptResponses = responsesFor(bundle, prompt._id)
        .filter((response) => !isForfeit(response))
        .toSorted((left, right) => left._id.localeCompare(right._id));
      for (const response of promptResponses) {
        const player = playersById.get(response.playerId);
        if (!player) continue;
        const competitor = getCompetitor(competitors, player);
        competitor.totalResponses += 1;
        competitor.totalVotes += voteCounts.get(response._id) ?? 0;
      }

      const promptVoteCount = promptResponses.reduce(
        (sum, response) => sum + (voteCounts.get(response._id) ?? 0),
        0,
      );
      if (promptResponses.length !== 2 || promptVoteCount <= 0) continue;
      const [leftResponse, rightResponse] = promptResponses;
      if (!leftResponse || !rightResponse) continue;
      const leftPlayer = playersById.get(leftResponse.playerId);
      const rightPlayer = playersById.get(rightResponse.playerId);
      if (!leftPlayer || !rightPlayer) continue;
      const leftVotes = voteCounts.get(leftResponse._id) ?? 0;
      const rightVotes = voteCounts.get(rightResponse._id) ?? 0;
      const leftCompetitor = getCompetitor(competitors, leftPlayer);
      const rightCompetitor = getCompetitor(competitors, rightPlayer);
      leftCompetitor.matchupsPlayed += 1;
      rightCompetitor.matchupsPlayed += 1;
      if (leftVotes > rightVotes) leftCompetitor.matchupsWon += 1;
      if (rightVotes > leftVotes) rightCompetitor.matchupsWon += 1;

      const leftHumanVotes = humanVoteCounts.get(leftResponse._id) ?? 0;
      const rightHumanVotes = humanVoteCounts.get(rightResponse._id) ?? 0;
      const humanAndAi =
        leftPlayer.type === "AI" && rightPlayer.type !== "AI"
          ? { aiPlayer: leftPlayer, aiVotes: leftHumanVotes, humanVotes: rightHumanVotes }
          : rightPlayer.type === "AI" && leftPlayer.type !== "AI"
            ? { aiPlayer: rightPlayer, aiVotes: rightHumanVotes, humanVotes: leftHumanVotes }
            : null;
      // A matchup no person voted on has no human verdict, so it is left out.
      if (
        humanAndAi?.aiPlayer.modelId &&
        leftHumanVotes + rightHumanVotes > 0 &&
        getModelByModelId(humanAndAi.aiPlayer.modelId)
      ) {
        const row = getHeadToHead(headToHead, humanAndAi.aiPlayer.modelId);
        if (humanAndAi.humanVotes > humanAndAi.aiVotes) row.humanWins += 1;
        else if (humanAndAi.aiVotes > humanAndAi.humanVotes) row.aiWins += 1;
        else row.ties += 1;
      }

      if (promptVoteCount < 2) continue;
      for (const response of promptResponses) {
        const voteCount = voteCounts.get(response._id) ?? 0;
        if (voteCount <= 0) continue;
        const player = playersById.get(response.playerId);
        if (!player) continue;
        const identity = competitorIdentity(player);
        bestResponses.push({
          promptId: prompt._id,
          responseId: response._id,
          competitorKey: identity.key,
          promptText: prompt.text,
          responseText: response.text,
          playerName: player.name,
          playerType: identity.type,
          ...(identity.modelId ? { modelId: identity.modelId } : {}),
          votePct: Math.round((voteCount / promptVoteCount) * 100),
          voteCount,
          totalVotes: promptVoteCount,
        });
      }
    }
  }

  const recognizedUsages = modelUsages.filter((usage) => getModelByModelId(usage.modelId));
  return {
    competitors,
    headToHead,
    bestResponses,
    modelUsages: recognizedUsages,
    totalPlayers: players.length,
    totalPrompts,
    totalVotes,
    totalTokens: recognizedUsages.reduce(
      (sum, usage) => sum + usage.inputTokens + usage.outputTokens,
      0,
    ),
    totalCost: recognizedUsages.reduce((sum, usage) => sum + usage.costUsd, 0),
  };
}

async function applyProjection(
  ctx: MutationCtx,
  game: Doc<"games">,
  projection: GameProjection,
): Promise<void> {
  const now = Date.now();
  for (const delta of projection.competitors.values()) {
    const existing = await ctx.db
      .query("leaderboardEntries")
      .withIndex("by_gameType_and_competitorKey", (index) =>
        index.eq("gameType", LEADERBOARD_GAME_TYPE).eq("competitorKey", delta.competitorKey),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("leaderboardEntries", existing._id, {
        displayName: delta.displayName,
        shortName: delta.shortName,
        type: delta.type,
        ...(delta.modelId ? { modelId: delta.modelId } : {}),
        totalVotes: existing.totalVotes + delta.totalVotes,
        totalResponses: existing.totalResponses + delta.totalResponses,
        matchupsWon: existing.matchupsWon + delta.matchupsWon,
        matchupsPlayed: existing.matchupsPlayed + delta.matchupsPlayed,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("leaderboardEntries", {
        gameType: LEADERBOARD_GAME_TYPE,
        competitorKey: delta.competitorKey,
        displayName: delta.displayName,
        shortName: delta.shortName,
        type: delta.type,
        ...(delta.modelId ? { modelId: delta.modelId } : {}),
        totalVotes: delta.totalVotes,
        totalResponses: delta.totalResponses,
        matchupsWon: delta.matchupsWon,
        matchupsPlayed: delta.matchupsPlayed,
        updatedAt: now,
      });
    }
  }

  for (const delta of projection.headToHead.values()) {
    const existing = await ctx.db
      .query("leaderboardHeadToHead")
      .withIndex("by_gameType_and_leftCompetitorKey_and_rightCompetitorKey", (index) =>
        index
          .eq("gameType", LEADERBOARD_GAME_TYPE)
          .eq("leftCompetitorKey", "HUMAN")
          .eq("rightCompetitorKey", delta.modelId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("leaderboardHeadToHead", existing._id, {
        leftWins: existing.leftWins + delta.humanWins,
        rightWins: existing.rightWins + delta.aiWins,
        ties: existing.ties + delta.ties,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("leaderboardHeadToHead", {
        gameType: LEADERBOARD_GAME_TYPE,
        leftCompetitorKey: "HUMAN",
        rightCompetitorKey: delta.modelId,
        leftWins: delta.humanWins,
        rightWins: delta.aiWins,
        ties: delta.ties,
        updatedAt: now,
      });
    }
  }

  for (const response of projection.bestResponses) {
    await ctx.db.insert("leaderboardBestResponses", {
      gameType: LEADERBOARD_GAME_TYPE,
      gameId: game._id,
      promptId: response.promptId,
      responseId: response.responseId,
      competitorKey: response.competitorKey,
      promptText: response.promptText,
      responseText: response.responseText,
      playerName: response.playerName,
      playerType: response.playerType,
      ...(response.modelId ? { modelId: response.modelId } : {}),
      votePct: response.votePct,
      voteCount: response.voteCount,
      totalVotes: response.totalVotes,
      createdAt: now,
    });
  }

  for (const usage of projection.modelUsages) {
    const existing = await ctx.db
      .query("leaderboardModelUsage")
      .withIndex("by_modelId", (index) => index.eq("modelId", usage.modelId))
      .unique();
    if (existing) {
      await ctx.db.patch("leaderboardModelUsage", existing._id, {
        inputTokens: existing.inputTokens + usage.inputTokens,
        outputTokens: existing.outputTokens + usage.outputTokens,
        costUsd: existing.costUsd + usage.costUsd,
        gamesPlayed: existing.gamesPlayed + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("leaderboardModelUsage", {
        modelId: usage.modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        gamesPlayed: 1,
        updatedAt: now,
      });
    }
  }

  const stats = await ctx.db
    .query("leaderboardStats")
    .withIndex("by_gameType", (index) => index.eq("gameType", LEADERBOARD_GAME_TYPE))
    .unique();
  if (stats) {
    await ctx.db.patch("leaderboardStats", stats._id, {
      completedGames: stats.completedGames + 1,
      totalPlayers: stats.totalPlayers + projection.totalPlayers,
      totalPrompts: stats.totalPrompts + projection.totalPrompts,
      totalVotes: stats.totalVotes + projection.totalVotes,
      totalTokens: stats.totalTokens + projection.totalTokens,
      totalCost: stats.totalCost + projection.totalCost,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("leaderboardStats", {
      gameType: LEADERBOARD_GAME_TYPE,
      completedGames: 1,
      totalPlayers: projection.totalPlayers,
      totalPrompts: projection.totalPrompts,
      totalVotes: projection.totalVotes,
      totalTokens: projection.totalTokens,
      totalCost: projection.totalCost,
      updatedAt: now,
    });
  }
}

/** Folds a finished SlopLash game into the all-time tables, once. */
export const projectGame = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (
      !game ||
      game.gameType !== LEADERBOARD_GAME_TYPE ||
      game.status !== "FINISHED" ||
      game.leaderboardProjected
    ) {
      return;
    }
    await ctx.db.patch("games", game._id, { leaderboardProjected: true });
    const projection = await buildProjection(ctx, game);
    if (projection.totalPrompts === 0) return;
    await applyProjection(ctx, game, projection);
  },
});

export const get = query({
  args: {},
  returns: v.object({
    leaderboard: v.array(contestantValidator),
    headToHead: v.array(headToHeadValidator),
    bestResponses: v.array(bestResponseValidator),
    modelUsage: v.array(modelUsageValidator),
    stats: statsValidator,
  }),
  handler: async (ctx) => {
    const [entries, headToHeadRows, bestResponses, usageRows, stats] = await Promise.all([
      ctx.db
        .query("leaderboardEntries")
        .withIndex("by_gameType_and_totalVotes", (index) =>
          index.eq("gameType", LEADERBOARD_GAME_TYPE),
        )
        .order("desc")
        .take(MAX_LEADERBOARD_ENTRIES),
      ctx.db
        .query("leaderboardHeadToHead")
        .withIndex("by_gameType_and_leftCompetitorKey_and_rightCompetitorKey", (index) =>
          index.eq("gameType", LEADERBOARD_GAME_TYPE),
        )
        .take(MAX_HEAD_TO_HEAD_ROWS),
      ctx.db
        .query("leaderboardBestResponses")
        .withIndex("by_gameType_and_votePct_and_voteCount", (index) =>
          index.eq("gameType", LEADERBOARD_GAME_TYPE),
        )
        .order("desc")
        .take(BEST_RESPONSE_LIMIT),
      ctx.db
        .query("leaderboardModelUsage")
        .withIndex("by_costUsd")
        .order("desc")
        .take(MAX_MODEL_USAGE_ROWS),
      ctx.db
        .query("leaderboardStats")
        .withIndex("by_gameType", (index) => index.eq("gameType", LEADERBOARD_GAME_TYPE))
        .unique(),
    ]);
    const totalVotes = stats?.totalVotes ?? 0;
    return {
      leaderboard: entries.map((entry) => ({
        key: entry.competitorKey,
        name: entry.displayName,
        shortName: entry.shortName,
        type: entry.type,
        modelId: entry.modelId ?? null,
        totalVotes: entry.totalVotes,
        totalResponses: entry.totalResponses,
        matchupsWon: entry.matchupsWon,
        matchupsPlayed: entry.matchupsPlayed,
        winRate:
          entry.matchupsPlayed > 0
            ? Math.round((entry.matchupsWon / entry.matchupsPlayed) * 100)
            : 0,
        voteShare: totalVotes > 0 ? Math.round((entry.totalVotes / totalVotes) * 100) : 0,
      })),
      headToHead: headToHeadRows
        .flatMap((row) => {
          const model = getModelByModelId(row.rightCompetitorKey);
          if (!model || row.leftCompetitorKey !== "HUMAN") return [];
          return [
            {
              modelId: model.id,
              modelName: model.name,
              modelShortName: model.shortName,
              humanWins: row.leftWins,
              aiWins: row.rightWins,
              ties: row.ties,
              total: row.leftWins + row.rightWins + row.ties,
            },
          ];
        })
        .toSorted((left, right) => right.total - left.total),
      bestResponses: bestResponses.map((response) => ({
        promptText: response.promptText,
        responseText: response.responseText,
        playerName: response.playerName,
        playerType: response.playerType,
        modelId: response.modelId ?? null,
        votePct: response.votePct,
        voteCount: response.voteCount,
        totalVotes: response.totalVotes,
      })),
      modelUsage: usageRows.flatMap((usage) => {
        const model = getModelByModelId(usage.modelId);
        return model
          ? [
              {
                modelId: usage.modelId,
                modelName: model.name,
                modelShortName: model.shortName,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                costUsd: usage.costUsd,
              },
            ]
          : [];
      }),
      stats: {
        totalGames: stats?.completedGames ?? 0,
        totalPrompts: stats?.totalPrompts ?? 0,
        totalVotes,
        totalTokens: stats?.totalTokens ?? 0,
        totalCost: stats?.totalCost ?? 0,
      },
    };
  },
});
