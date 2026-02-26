/** Shared Prisma include/select fragments for game queries. */

const responsePlayerSelect = {
  id: true,
  name: true,
  type: true,
  modelId: true,
  idleRounds: true,
  humorRating: true,
  winStreak: true,
} as const;

/** Full round include — used for FINAL_RESULTS and recap. */
export const roundsInclude = {
  prompts: {
    include: {
      responses: {
        include: {
          player: { select: responsePlayerSelect },
          reactions: true,
        },
      },
      votes: {
        include: { voter: { select: { id: true, type: true } } },
      },
      assignments: { select: { promptId: true, playerId: true } },
    },
  },
} as const;

/** Minimal round include for WRITING phase — only assignments + response stubs. */
export const roundsIncludeWriting = {
  prompts: {
    include: {
      assignments: { select: { promptId: true, playerId: true } },
      responses: {
        select: { id: true, playerId: true, text: true },
      },
    },
  },
} as const;

/** Round include for VOTING / ROUND_RESULTS — full responses & votes, no assignments. */
export const roundsIncludeActive = {
  prompts: {
    include: {
      responses: {
        include: {
          player: { select: responsePlayerSelect },
          reactions: true,
        },
      },
      votes: {
        include: { voter: { select: { id: true, type: true } } },
      },
    },
  },
} as const;

export const modelUsagesInclude = {
  select: { modelId: true, inputTokens: true, outputTokens: true, costUsd: true },
  orderBy: { costUsd: "desc" as const },
} as const;
