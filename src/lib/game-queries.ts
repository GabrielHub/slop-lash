/**
 * Shared Prisma include/select fragments for game queries.
 * Used by the game polling route and recap route.
 */

const responsePlayerSelect = {
  id: true,
  name: true,
  type: true,
  modelId: true,
  humorRating: true,
  winStreak: true,
  lastSeen: true,
} as const;

export const roundsInclude = {
  prompts: {
    omit: { ttsAudio: true },
    include: {
      responses: {
        include: { player: { select: responsePlayerSelect } },
      },
      votes: {
        include: { voter: { select: { id: true, type: true } } },
      },
      assignments: { select: { promptId: true, playerId: true } },
    },
  },
} as const;

export const modelUsagesInclude = {
  select: { modelId: true, inputTokens: true, outputTokens: true, costUsd: true },
  orderBy: { costUsd: "desc" as const },
} as const;
