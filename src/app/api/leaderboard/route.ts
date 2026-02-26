import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { LEADERBOARD_TAG } from "@/lib/game-constants";
import type { LeaderboardApiResponse } from "@/lib/leaderboard-analytics";
import { getLeaderboardAggregateOrSeed } from "@/lib/leaderboard-aggregate";

const emptyData: LeaderboardApiResponse = {
  leaderboard: [],
  headToHead: [],
  bestResponses: [],
  modelUsage: [],
  stats: { totalGames: 0, totalPrompts: 0, totalVotes: 0, totalTokens: 0, totalCost: 0 },
};

/** Cached leaderboard computation. Revalidated via tag when games finish, plus 60s TTL. */
const getLeaderboardData = unstable_cache(
  async () => getLeaderboardAggregateOrSeed(),
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
