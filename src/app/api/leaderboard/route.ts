import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AI_MODELS } from "@/lib/models";

export const dynamic = "force-dynamic";

let cache: { data: object; timestamp: number } | null = null;
const TTL = 30_000;

function contestantKey(player: { type: string; modelId: string | null }): string {
  return player.type === "HUMAN" ? "HUMAN" : (player.modelId ?? "HUMAN");
}

interface ContestantStats {
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

interface HeadToHead {
  modelId: string;
  modelName: string;
  modelShortName: string;
  humanWins: number;
  aiWins: number;
  ties: number;
  total: number;
}

interface BestResponse {
  promptText: string;
  responseText: string;
  playerName: string;
  playerType: "HUMAN" | "AI";
  modelId: string | null;
  votePct: number;
  voteCount: number;
  totalVotes: number;
}

export async function GET() {
  if (cache && Date.now() - cache.timestamp < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    // Quick check: if no completed games, return empty data immediately
    const totalGames = await prisma.game.count({ where: { status: "FINAL_RESULTS" } });
    if (totalGames === 0) {
      const emptyData = {
        leaderboard: [],
        headToHead: [],
        bestResponses: [],
        stats: { totalGames: 0, totalPrompts: 0, totalVotes: 0 },
      };
      cache = { data: emptyData, timestamp: Date.now() };
      return NextResponse.json(emptyData);
    }

    // Fetch all prompts from completed games with responses and vote counts
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
        },
      }),
    ]);

    // Build contestant stats
    const statsMap = new Map<string, ContestantStats>();

    // Initialize "HUMAN" entry
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

    // Initialize AI model entries
    for (const model of AI_MODELS) {
      statsMap.set(model.id, {
        key: model.id,
        name: model.name,
        shortName: model.shortName,
        type: "AI",
        modelId: model.id,
        totalVotes: 0,
        totalResponses: 0,
        matchupsWon: 0,
        matchupsPlayed: 0,
        winRate: 0,
        voteShare: 0,
      });
    }

    // Head-to-head tracking
    const h2hMap = new Map<
      string,
      { humanWins: number; aiWins: number; ties: number }
    >();

    // Best responses tracking
    const bestResponses: BestResponse[] = [];

    // Process each prompt
    for (const prompt of prompts) {
      const promptTotalVotes = prompt._count.votes;

      for (const resp of prompt.responses) {
        const key = contestantKey(resp.player);
        const entry = statsMap.get(key);
        if (entry) {
          entry.totalVotes += resp._count.votes;
          entry.totalResponses += 1;
        }
      }

      // Matchup calculations (only for prompts with exactly 2 responses and votes)
      if (prompt.responses.length === 2 && promptTotalVotes > 0) {
        const [a, b] = prompt.responses;
        const aVotes = a._count.votes;
        const bVotes = b._count.votes;
        const aKey = contestantKey(a.player);
        const bKey = contestantKey(b.player);

        // Track matchups played
        const aEntry = statsMap.get(aKey);
        const bEntry = statsMap.get(bKey);
        if (aEntry) aEntry.matchupsPlayed += 1;
        if (bEntry) bEntry.matchupsPlayed += 1;

        // Determine winner
        if (aVotes > bVotes) {
          if (aEntry) aEntry.matchupsWon += 1;
        } else if (bVotes > aVotes) {
          if (bEntry) bEntry.matchupsWon += 1;
        }
        // Ties: neither gets a win

        // Head-to-head: Human vs AI matchups
        const isHumanVsAI =
          (a.player.type === "HUMAN" && b.player.type === "AI") ||
          (a.player.type === "AI" && b.player.type === "HUMAN");

        if (isHumanVsAI) {
          const [humanResp, aiResp] =
            a.player.type === "HUMAN" ? [a, b] : [b, a];
          const aiModelId = aiResp.player.modelId ?? "";

          let h2h = h2hMap.get(aiModelId);
          if (!h2h) {
            h2h = { humanWins: 0, aiWins: 0, ties: 0 };
            h2hMap.set(aiModelId, h2h);
          }

          if (humanResp._count.votes > aiResp._count.votes) {
            h2h.humanWins += 1;
          } else if (aiResp._count.votes > humanResp._count.votes) {
            h2h.aiWins += 1;
          } else {
            h2h.ties += 1;
          }
        }

        // Track best response candidates
        for (const resp of prompt.responses) {
          if (resp._count.votes > 0) {
            bestResponses.push({
              promptText: prompt.text,
              responseText: resp.text,
              playerName: resp.player.name,
              playerType: resp.player.type as "HUMAN" | "AI",
              modelId: resp.player.modelId,
              votePct: Math.round(
                (resp._count.votes / promptTotalVotes) * 100
              ),
              voteCount: resp._count.votes,
              totalVotes: promptTotalVotes,
            });
          }
        }
      }
    }

    // Calculate derived stats
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

    // Build leaderboard (sorted by total votes, only entries with responses)
    const leaderboard = [...statsMap.values()]
      .filter((e) => e.totalResponses > 0)
      .sort((a, b) => b.totalVotes - a.totalVotes);

    // Build head-to-head list
    const headToHead: HeadToHead[] = [];
    for (const [modelId, record] of h2hMap) {
      const model = AI_MODELS.find((m) => m.id === modelId);
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

    // Top 5 best responses (by vote percentage, min 2 total votes)
    const topResponses = bestResponses
      .filter((r) => r.totalVotes >= 2)
      .sort((a, b) => b.votePct - a.votePct || b.voteCount - a.voteCount)
      .slice(0, 5);

    const responseData = {
      leaderboard,
      headToHead,
      bestResponses: topResponses,
      stats: {
        totalGames,
        totalPrompts: prompts.length,
        totalVotes,
      },
    };

    cache = { data: responseData, timestamp: Date.now() };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Leaderboard fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
