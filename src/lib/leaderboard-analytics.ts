import { getLeaderboardModelNames, getModelByModelId } from "@/lib/models";

export interface ContestantStats {
  key: string;
  name: string;
  shortName: string;
  type: "HUMAN" | "AI";
  modelId: string | null;
  totalVotes: number;
  totalResponses: number;
  matchupsWon: number;
  matchupsPlayed: number;
  winRate: number;
  voteShare: number;
}

export interface HeadToHead {
  modelId: string;
  modelName: string;
  modelShortName: string;
  humanWins: number;
  aiWins: number;
  ties: number;
  total: number;
}

export interface BestResponse {
  promptText: string;
  responseText: string;
  playerName: string;
  playerType: "HUMAN" | "AI";
  modelId: string | null;
  votePct: number;
  voteCount: number;
  totalVotes: number;
}

export interface ModelUsageStats {
  modelId: string;
  modelName: string;
  modelShortName: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LeaderboardApiResponse {
  leaderboard: ContestantStats[];
  headToHead: HeadToHead[];
  bestResponses: BestResponse[];
  modelUsage: ModelUsageStats[];
  stats: {
    totalGames: number;
    totalPrompts: number;
    totalVotes: number;
    totalTokens: number;
    totalCost: number;
  };
}

export interface PromptAnalyticsInput {
  text: string;
  responses: {
    text: string;
    player: {
      type: string;
      modelId: string | null;
      name: string;
    };
    _count: {
      votes: number;
    };
  }[];
}

function contestantKey(player: { type: string; modelId: string | null }): string {
  return player.type === "HUMAN" ? "HUMAN" : (player.modelId ?? "HUMAN");
}

function createContestantEntry(key: string, modelId: string): ContestantStats {
  const { name, shortName } = getLeaderboardModelNames(modelId);
  return {
    key,
    name,
    shortName,
    type: "AI",
    modelId,
    totalVotes: 0,
    totalResponses: 0,
    matchupsWon: 0,
    matchupsPlayed: 0,
    winRate: 0,
    voteShare: 0,
  };
}

function isAiPlayer(player: { type: string; modelId: string | null }): player is { type: "AI"; modelId: string } {
  return player.type === "AI" && player.modelId != null;
}

export function computeLeaderboardPromptAnalytics(
  prompts: PromptAnalyticsInput[],
  totalVotes: number,
): Pick<LeaderboardApiResponse, "leaderboard" | "headToHead" | "bestResponses"> {
  const statsMap = new Map<string, ContestantStats>();

  statsMap.set("HUMAN", {
    key: "HUMAN",
    name: "Humans",
    shortName: "Human",
    type: "HUMAN",
    modelId: null,
    totalVotes: 0,
    totalResponses: 0,
    matchupsWon: 0,
    matchupsPlayed: 0,
    winRate: 0,
    voteShare: 0,
  });

  function getOrCreateEntry(player: { type: string; modelId: string | null }): ContestantStats | undefined {
    const key = contestantKey(player);
    const existing = statsMap.get(key);
    if (existing) return existing;
    if (!isAiPlayer(player)) return undefined;
    const entry = createContestantEntry(key, player.modelId);
    statsMap.set(key, entry);
    return entry;
  }

  const h2hMap = new Map<string, { humanWins: number; aiWins: number; ties: number }>();
  const bestResponses: BestResponse[] = [];

  for (const prompt of prompts) {
    for (const response of prompt.responses) {
      const entry = getOrCreateEntry(response.player);
      if (!entry) continue;
      entry.totalVotes += response._count.votes;
      entry.totalResponses += 1;
    }

    const actualTotalVotes = prompt.responses.reduce((sum, response) => sum + response._count.votes, 0);
    if (prompt.responses.length !== 2 || actualTotalVotes <= 0) {
      continue;
    }

    const [a, b] = prompt.responses;
    const aVotes = a._count.votes;
    const bVotes = b._count.votes;

    const aEntry = getOrCreateEntry(a.player);
    const bEntry = getOrCreateEntry(b.player);

    if (aEntry) aEntry.matchupsPlayed += 1;
    if (bEntry) bEntry.matchupsPlayed += 1;

    if (aVotes > bVotes) {
      if (aEntry) aEntry.matchupsWon += 1;
    } else if (bVotes > aVotes) {
      if (bEntry) bEntry.matchupsWon += 1;
    }

    const isHumanVsAI =
      (a.player.type === "HUMAN" && b.player.type === "AI") ||
      (a.player.type === "AI" && b.player.type === "HUMAN");

    if (isHumanVsAI) {
      const [humanResponse, aiResponse] = a.player.type === "HUMAN" ? [a, b] : [b, a];
      const aiModelId = aiResponse.player.modelId ?? "";
      const h2h = h2hMap.get(aiModelId) ?? { humanWins: 0, aiWins: 0, ties: 0 };

      if (humanResponse._count.votes > aiResponse._count.votes) {
        h2h.humanWins += 1;
      } else if (aiResponse._count.votes > humanResponse._count.votes) {
        h2h.aiWins += 1;
      } else {
        h2h.ties += 1;
      }

      h2hMap.set(aiModelId, h2h);
    }

    for (const response of prompt.responses) {
      if (response._count.votes <= 0) continue;
      bestResponses.push({
        promptText: prompt.text,
        responseText: response.text,
        playerName: response.player.name,
        playerType: response.player.type === "AI" ? "AI" : "HUMAN",
        modelId: response.player.modelId,
        votePct: Math.round((response._count.votes / actualTotalVotes) * 100),
        voteCount: response._count.votes,
        totalVotes: actualTotalVotes,
      });
    }
  }

  for (const entry of statsMap.values()) {
    entry.winRate =
      entry.matchupsPlayed > 0
        ? Math.round((entry.matchupsWon / entry.matchupsPlayed) * 100)
        : 0;
    entry.voteShare =
      totalVotes > 0
        ? Math.round((entry.totalVotes / totalVotes) * 100)
        : 0;
  }

  const leaderboard = [...statsMap.values()]
    .filter((entry) => entry.totalResponses > 0)
    .sort((a, b) => b.totalVotes - a.totalVotes);

  const headToHead: HeadToHead[] = [];
  for (const [modelId, record] of h2hMap) {
    const model = getModelByModelId(modelId);
    if (!model) continue;
    headToHead.push({
      modelId,
      modelName: model.name,
      modelShortName: model.shortName,
      humanWins: record.humanWins,
      aiWins: record.aiWins,
      ties: record.ties,
      total: record.humanWins + record.aiWins + record.ties,
    });
  }
  headToHead.sort((a, b) => b.total - a.total);

  const topResponses = bestResponses
    .filter((response) => response.totalVotes >= 2)
    .sort((a, b) => b.votePct - a.votePct || b.voteCount - a.voteCount)
    .slice(0, 5);

  return {
    leaderboard,
    headToHead,
    bestResponses: topResponses,
  };
}
