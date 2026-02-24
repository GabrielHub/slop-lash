/**
 * Shared Prisma include/select fragments for game queries.
 * Used by the game polling route and recap route.
 */

export const roundsInclude = {
  prompts: {
    omit: { ttsAudio: true },
    include: {
      responses: {
        include: { player: { select: { id: true, name: true, type: true, modelId: true, lastSeen: true } } },
      },
      votes: true,
      assignments: { select: { promptId: true, playerId: true } },
    },
  },
} as const;

export const modelUsagesInclude = {
  select: { modelId: true, inputTokens: true, outputTokens: true, costUsd: true },
  orderBy: { costUsd: "desc" as const },
} as const;
