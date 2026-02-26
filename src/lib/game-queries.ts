/** Shared Prisma include/select fragments for game queries. */

const responsePlayerSelect = {
  id: true,
  name: true,
  type: true,
  modelId: true,
} as const;

const reactionSelect = {
  id: true,
  responseId: true,
  playerId: true,
  emoji: true,
} as const;

const voteSelect = {
  id: true,
  voterId: true,
  responseId: true,
  failReason: true,
  voter: { select: { id: true, type: true } },
} as const;

const responseSelect = {
  id: true,
  promptId: true,
  playerId: true,
  text: true,
  pointsEarned: true,
  failReason: true,
  player: { select: responsePlayerSelect },
  reactions: { select: reactionSelect },
} as const;

/** Full round include — used for FINAL_RESULTS and recap. */
export const roundsInclude = {
  prompts: {
    include: {
      assignments: { select: { promptId: true, playerId: true } },
      responses: {
        select: responseSelect,
      },
      votes: {
        select: voteSelect,
      },
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

/** Round include for VOTING / ROUND_RESULTS — full responses & votes + assignments. */
export const roundsIncludeActive = {
  prompts: {
    include: {
      assignments: { select: { promptId: true, playerId: true } },
      responses: {
        select: responseSelect,
      },
      votes: {
        select: voteSelect,
      },
    },
  },
} as const;

export const modelUsagesInclude = {
  select: { modelId: true, inputTokens: true, outputTokens: true, costUsd: true },
  orderBy: { costUsd: "desc" as const },
} as const;
