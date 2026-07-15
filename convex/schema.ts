import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  gameStatusValidator,
  gameTypeValidator,
  generationKindValidator,
  generationStatusValidator,
  matchSlopIdentityValidator,
  matchSlopOutcomeValidator,
  matchSlopTranscriptOutcomeValidator,
  participationStatusValidator,
  playerTypeValidator,
  sessionRoleValidator,
  ttsModeValidator,
} from "./validators";
import {
  matchSlopPendingPersonaReplyValidator,
  matchSlopPersonaImageValidator,
  matchSlopPostMortemDraftValidator,
  matchSlopPostMortemGenerationValidator,
  matchSlopPostMortemValidator,
  matchSlopProfileDraftValidator,
  matchSlopProfileGenerationValidator,
  matchSlopProfileValidator,
  matchSlopRoundResultValidator,
} from "./matchslopValidators";

export default defineSchema({
  games: defineTable({
    roomCode: v.string(),
    gameType: gameTypeValidator,
    status: gameStatusValidator,
    currentRound: v.number(),
    totalRounds: v.number(),
    maxPlayers: v.number(),
    playerCount: v.number(),
    hostPlayerId: v.optional(v.id("players")),
    hostSessionId: v.optional(v.id("playerSessions")),
    personaModelId: v.optional(v.string()),
    phaseDeadline: v.optional(v.number()),
    phaseGeneration: v.number(),
    timersDisabled: v.boolean(),
    ttsMode: ttsModeValidator,
    ttsVoice: v.string(),
    votingPromptIndex: v.number(),
    votingRevealing: v.boolean(),
    nextGameId: v.optional(v.id("games")),
    winnerTagline: v.optional(v.string()),
    finalizedAt: v.optional(v.number()),
    leaderboardProjectionStatus: v.optional(
      v.union(v.literal("PENDING"), v.literal("SCHEDULED"), v.literal("PROJECTED")),
    ),
    leaderboardProjectionScheduledAt: v.optional(v.number()),
    aiInputTokens: v.number(),
    aiOutputTokens: v.number(),
    aiCostUsd: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_roomCode", ["roomCode"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"])
    .index("by_gameType_and_status_and_createdAt", ["gameType", "status", "createdAt"])
    .index("by_gameType_and_status_and_finalizedAt", ["gameType", "status", "finalizedAt"])
    .index("by_projection_pending", [
      "gameType",
      "status",
      "leaderboardProjectionStatus",
      "createdAt",
    ])
    .index("by_projection_retry", [
      "gameType",
      "leaderboardProjectionStatus",
      "leaderboardProjectionScheduledAt",
    ]),

  playerSessions: defineTable({
    gameId: v.id("games"),
    playerId: v.optional(v.id("players")),
    role: sessionRoleValidator,
    capabilityHash: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_gameId", ["gameId"])
    .index("by_gameId_and_playerId", ["gameId", "playerId"])
    .index("by_expiresAt", ["expiresAt"])
    .index("by_revokedAt", ["revokedAt"]),

  roomPresenceSessions: defineTable({
    gameId: v.id("games"),
    roomSessionId: v.id("playerSessions"),
    tabSessionId: v.string(),
    sessionToken: v.string(),
    lastHeartbeatAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_roomSessionId", ["roomSessionId"])
    .index("by_tabSessionId", ["tabSessionId"])
    .index("by_sessionToken", ["sessionToken"])
    .index("by_lastHeartbeatAt", ["lastHeartbeatAt"]),

  roomJoinRateLimits: defineTable({
    gameId: v.id("games"),
    windowStartedAt: v.number(),
    attempts: v.number(),
  }).index("by_gameId", ["gameId"]),

  players: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    normalizedName: v.string(),
    type: playerTypeValidator,
    modelId: v.optional(v.string()),
    idleRounds: v.number(),
    score: v.number(),
    humorRating: v.number(),
    winStreak: v.number(),
    participationStatus: participationStatusValidator,
    joinedAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_gameId_and_normalizedName", ["gameId", "normalizedName"])
    .index("by_gameId_and_type", ["gameId", "type"]),

  rounds: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    openedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  }).index("by_gameId_and_roundNumber", ["gameId", "roundNumber"]),

  prompts: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    ordinal: v.number(),
    text: v.string(),
  })
    .index("by_roundId_and_ordinal", ["roundId", "ordinal"])
    .index("by_gameId_and_roundId", ["gameId", "roundId"]),

  promptAssignments: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    promptId: v.id("prompts"),
    playerId: v.id("players"),
  })
    .index("by_promptId_and_playerId", ["promptId", "playerId"])
    .index("by_playerId_and_roundId", ["playerId", "roundId"])
    .index("by_gameId_and_roundId", ["gameId", "roundId"]),

  responses: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    promptId: v.id("prompts"),
    playerId: v.id("players"),
    text: v.string(),
    metadata: v.optional(v.record(v.string(), v.any())),
    pointsEarned: v.number(),
    failReason: v.optional(v.string()),
    submittedAt: v.number(),
  })
    .index("by_promptId_and_playerId", ["promptId", "playerId"])
    .index("by_playerId_and_roundId", ["playerId", "roundId"])
    .index("by_gameId_and_roundId", ["gameId", "roundId"]),

  votes: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    promptId: v.id("prompts"),
    voterId: v.id("players"),
    responseId: v.optional(v.id("responses")),
    failReason: v.optional(v.string()),
    castAt: v.number(),
  })
    .index("by_promptId_and_voterId", ["promptId", "voterId"])
    .index("by_responseId", ["responseId"])
    .index("by_gameId_and_roundId", ["gameId", "roundId"]),

  reactions: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    responseId: v.id("responses"),
    playerId: v.id("players"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_responseId", ["responseId"])
    .index("by_responseId_and_playerId_and_emoji", ["responseId", "playerId", "emoji"])
    .index("by_gameId_and_roundId", ["gameId", "roundId"])
    .index("by_gameId_and_createdAt", ["gameId", "createdAt"]),

  chatMessages: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    roundNumber: v.optional(v.number()),
    content: v.string(),
    replyToId: v.optional(v.id("chatMessages")),
    clientId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_gameId_and_createdAt", ["gameId", "createdAt"])
    .index("by_gameId_and_roundNumber_and_createdAt", ["gameId", "roundNumber", "createdAt"])
    .index("by_playerId_and_clientId", ["playerId", "clientId"])
    .index("by_playerId_and_createdAt", ["playerId", "createdAt"]),

  gameModelUsage: defineTable({
    gameId: v.id("games"),
    modelId: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
  })
    .index("by_gameId_and_modelId", ["gameId", "modelId"])
    .index("by_modelId", ["modelId"]),

  matchSlopState: defineTable({
    gameId: v.id("games"),
    seekerIdentity: matchSlopIdentityValidator,
    personaIdentity: matchSlopIdentityValidator,
    outcome: matchSlopOutcomeValidator,
    humanVoteWeight: v.number(),
    aiVoteWeight: v.number(),
    comebackRound: v.optional(v.number()),
    mood: v.number(),
    selectedPersonaExampleIds: v.array(v.string()),
    selectedPlayerExamples: v.array(v.string()),
    profile: v.optional(matchSlopProfileValidator),
    profileDraft: v.optional(matchSlopProfileDraftValidator),
    profileGeneration: v.optional(matchSlopProfileGenerationValidator),
    personaImage: v.optional(matchSlopPersonaImageValidator),
    lastRoundResult: v.optional(matchSlopRoundResultValidator),
    pendingPersonaReply: v.optional(matchSlopPendingPersonaReplyValidator),
    postMortem: v.optional(matchSlopPostMortemValidator),
    postMortemDraft: v.optional(matchSlopPostMortemDraftValidator),
    postMortemGeneration: v.optional(matchSlopPostMortemGenerationValidator),
    latestSignalCategory: v.optional(v.string()),
    latestSideComment: v.optional(v.string()),
    latestNextSignal: v.optional(v.string()),
    latestMoodDelta: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_gameId", ["gameId"]),

  matchSlopTranscriptEntries: defineTable({
    gameId: v.id("games"),
    turn: v.number(),
    ordinal: v.number(),
    speaker: v.union(v.literal("PLAYERS"), v.literal("PERSONA")),
    text: v.string(),
    outcome: v.optional(matchSlopTranscriptOutcomeValidator),
    authorName: v.optional(v.string()),
    selectedPromptText: v.optional(v.string()),
    selectedPromptId: v.optional(v.string()),
    mood: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_gameId_and_turn_and_ordinal", ["gameId", "turn", "ordinal"]),

  generationJobs: defineTable({
    gameId: v.id("games"),
    kind: generationKindValidator,
    generationKey: v.string(),
    targetId: v.optional(v.string()),
    responderId: v.optional(v.id("players")),
    reservedUntil: v.optional(v.number()),
    status: generationStatusValidator,
    attempt: v.number(),
    workId: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_gameId_and_generationKey", ["gameId", "generationKey"])
    .index("by_gameId_and_kind_and_status", ["gameId", "kind", "status"])
    .index("by_gameId_and_kind_and_responderId_and_createdAt", [
      "gameId",
      "kind",
      "responderId",
      "createdAt",
    ])
    .index("by_gameId_and_status", ["gameId", "status"])
    .index("by_gameId_and_status_and_updatedAt", ["gameId", "status", "updatedAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  leaderboardEntries: defineTable({
    gameType: gameTypeValidator,
    competitorKey: v.string(),
    displayName: v.string(),
    shortName: v.string(),
    type: v.union(v.literal("HUMAN"), v.literal("AI")),
    modelId: v.optional(v.string()),
    totalVotes: v.number(),
    totalResponses: v.number(),
    matchupsWon: v.number(),
    matchupsPlayed: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gameType_and_competitorKey", ["gameType", "competitorKey"])
    .index("by_gameType_and_totalVotes", ["gameType", "totalVotes"]),

  leaderboardHeadToHead: defineTable({
    gameType: gameTypeValidator,
    leftCompetitorKey: v.string(),
    rightCompetitorKey: v.string(),
    leftWins: v.number(),
    rightWins: v.number(),
    ties: v.number(),
    updatedAt: v.number(),
  }).index("by_gameType_and_leftCompetitorKey_and_rightCompetitorKey", [
    "gameType",
    "leftCompetitorKey",
    "rightCompetitorKey",
  ]),

  leaderboardBestResponses: defineTable({
    gameType: gameTypeValidator,
    gameId: v.id("games"),
    promptId: v.id("prompts"),
    responseId: v.id("responses"),
    competitorKey: v.string(),
    promptText: v.string(),
    responseText: v.string(),
    playerName: v.string(),
    playerType: v.union(v.literal("HUMAN"), v.literal("AI")),
    modelId: v.optional(v.string()),
    votePct: v.number(),
    voteCount: v.number(),
    totalVotes: v.number(),
    createdAt: v.number(),
  })
    .index("by_gameType_and_votePct_and_voteCount", ["gameType", "votePct", "voteCount"])
    .index("by_competitorKey_and_votePct", ["competitorKey", "votePct"])
    .index("by_responseId", ["responseId"]),

  leaderboardModelUsage: defineTable({
    modelId: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    gamesPlayed: v.number(),
    updatedAt: v.number(),
  })
    .index("by_modelId", ["modelId"])
    .index("by_costUsd", ["costUsd"]),

  leaderboardStats: defineTable({
    gameType: gameTypeValidator,
    completedGames: v.number(),
    abandonedGames: v.number(),
    totalPlayers: v.number(),
    totalPrompts: v.number(),
    totalVotes: v.number(),
    totalTokens: v.number(),
    totalCost: v.number(),
    updatedAt: v.number(),
  }).index("by_gameType", ["gameType"]),

  leaderboardProcessedGames: defineTable({
    gameId: v.id("games"),
    processedAt: v.number(),
  }).index("by_gameId", ["gameId"]),
});
