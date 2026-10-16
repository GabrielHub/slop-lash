import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  aiCallFields,
  gameStatusValidator,
  gameTypeValidator,
  jobStatusValidator,
  playerTypeValidator,
  ttsModeValidator,
} from "./validators";
import { matchslopTables } from "./matchslop/tables";
import { quizslopTables } from "./quizslop/tables";
import { slopfightTables } from "./slopfight/tables";
import { sloplashTables } from "./sloplash/tables";

export default defineSchema({
  /**
   * One row per room. The engine owns `status`, `phase`, `step`, `round`, and
   * the phase clock; each mode keeps anything else in its own tables.
   */
  games: defineTable({
    roomCode: v.string(),
    /** 1 for a new room, +1 for each "Play again" under the same code. The newest is live. */
    gameNumber: v.number(),
    gameType: gameTypeValidator,
    status: gameStatusValidator,
    /** Mode-specific phase name; "LOBBY" before start and "FINAL" after. */
    phase: v.string(),
    /** Sub-step inside a phase, e.g. which matchup is being voted on. */
    step: v.number(),
    round: v.number(),
    totalRounds: v.number(),
    /** Bumped on every phase change; guards every stale write and timer. */
    phaseGeneration: v.number(),
    phaseStartedAt: v.number(),
    phaseDeadline: v.optional(v.number()),
    /** The deadline is only a safety net for an AI wait, so screens show no countdown. */
    deadlineHidden: v.optional(v.boolean()),
    /** The creating session always keeps host powers. */
    hostSessionId: v.optional(v.id("playerSessions")),
    /** A big screen created the room rather than one of the players. */
    displayHost: v.boolean(),
    /** A player with host powers: the creator if they play, or a failover. */
    hostPlayerId: v.optional(v.id("players")),
    /** Created without the host password: Haiku writes, Jev judges. */
    freePlay: v.boolean(),
    timersDisabled: v.boolean(),
    /** The host asked for the how-to-play video before the game. A rematch skips it. */
    tutorial: v.optional(v.boolean()),
    /** When the how-to-play video began. The game starts when it ends, or when the host skips. */
    tutorialStartedAt: v.optional(v.number()),
    ttsMode: ttsModeValidator,
    ttsVoice: v.string(),
    finishedAt: v.optional(v.number()),
    leaderboardProjected: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_roomCode_and_gameNumber", ["roomCode", "gameNumber"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"])
    .index("by_status_and_phaseDeadline", ["status", "phaseDeadline"])
    .index("by_gameType_and_status_and_finishedAt", ["gameType", "status", "finishedAt"]),

  /** Throttles active-room housekeeping without invalidating game subscriptions. */
  roomMaintenance: defineTable({
    gameId: v.id("games"),
    checkedAt: v.number(),
  }).index("by_gameId", ["gameId"]),

  /** Free Play rooms created per UTC day, for the daily cap. */
  freePlayUsage: defineTable({
    day: v.string(),
    gamesCreated: v.number(),
  }).index("by_day", ["day"]),

  /** A bearer capability for one browser: a seat, or the display-only host. */
  playerSessions: defineTable({
    gameId: v.id("games"),
    playerId: v.optional(v.id("players")),
    capabilityHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_playerId", ["playerId"]),

  players: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    normalizedName: v.string(),
    type: playerTypeValidator,
    modelId: v.optional(v.string()),
    score: v.number(),
    kickedAt: v.optional(v.number()),
    joinedAt: v.number(),
    /** Their answer to the how-to-play video's practice question, for the run that began at `startedAt`. */
    tutorialPick: v.optional(v.object({ startedAt: v.number(), choice: v.number() })),
  })
    .index("by_gameId", ["gameId"])
    .index("by_gameId_and_normalizedName", ["gameId", "normalizedName"]),

  /** Rounds, prompts, responses, and votes are shared by SlopLash and MatchSlop. */
  rounds: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    scoredAt: v.optional(v.number()),
  }).index("by_gameId_and_roundNumber", ["gameId", "roundNumber"]),

  prompts: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    ordinal: v.number(),
    text: v.string(),
    /** Players who must answer this prompt. */
    assigneeIds: v.array(v.id("players")),
    /** Set once the matchup's points are on the scoreboard. */
    scoredAt: v.optional(v.number()),
  })
    .index("by_gameId", ["gameId"])
    .index("by_roundId", ["roundId"]),

  responses: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    promptId: v.id("prompts"),
    playerId: v.id("players"),
    /** `FORFEIT_MARKER` when nobody answered in time or the AI failed. */
    text: v.string(),
    /** MatchSlop: which profile prompt an opener replies to. */
    openerPromptId: v.optional(v.string()),
    pointsEarned: v.number(),
    /** SlopLash: points the author (an AI) lost because every human passed. */
    penalty: v.optional(v.number()),
    submittedAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_roundId", ["roundId"])
    .index("by_promptId_and_playerId", ["promptId", "playerId"]),

  votes: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    promptId: v.id("prompts"),
    voterId: v.id("players"),
    /** Absent for a pass or a timed-out ballot. */
    responseId: v.optional(v.id("responses")),
    /** True when the ballot was filled because the voter never acted. */
    timedOut: v.boolean(),
    /** SlopLash: points this voter lost for passing on a matchup a human wrote. */
    penalty: v.optional(v.number()),
    castAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_roundId", ["roundId"])
    .index("by_promptId_and_voterId", ["promptId", "voterId"]),

  reactions: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    responseId: v.id("responses"),
    playerId: v.id("players"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_roundId", ["roundId"])
    .index("by_responseId_and_playerId_and_emoji", ["responseId", "playerId", "emoji"]),

  /**
   * One row per AI call. `phaseGeneration` pins phase-bound jobs to the phase
   * that queued them, so a late result can never land in a later phase.
   */
  generationJobs: defineTable({
    gameId: v.id("games"),
    kind: v.string(),
    key: v.string(),
    phaseGeneration: v.number(),
    /** Phase-bound jobs are discarded once the phase moves on. */
    phaseBound: v.boolean(),
    payload: v.optional(v.any()),
    status: jobStatusValidator,
    error: v.optional(v.string()),
    /**
     * Why the AI work failed, set with status FAILED: the runner's reason
     * (e.g. an `AiFailReason`) after `apply` handled it, or "action-error"
     * when the action itself threw.
     */
    failReason: v.optional(v.string()),
    /** When the runner picked the job up; minus `createdAt` is time spent queued. */
    startedAt: v.optional(v.number()),
    /** How long the runner took, every call and retry included. */
    latencyMs: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gameId_and_key", ["gameId", "key"])
    .index("by_gameId_and_status", ["gameId", "status"]),

  /** One row per model call made for a game (see docs/ai-calls.md). */
  aiCalls: defineTable({
    gameId: v.id("games"),
    jobId: v.optional(v.id("generationJobs")),
    ...aiCallFields,
  }).index("by_gameId", ["gameId"]),

  gameModelUsage: defineTable({
    gameId: v.id("games"),
    modelId: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
  }).index("by_gameId_and_modelId", ["gameId", "modelId"]),

  /** SlopLash only: the AI leader's victory line for a results phase. */
  winnerTaglines: defineTable({
    gameId: v.id("games"),
    phaseGeneration: v.number(),
    playerId: v.id("players"),
    text: v.optional(v.string()),
  }).index("by_gameId_and_phaseGeneration", ["gameId", "phaseGeneration"]),

  leaderboardEntries: defineTable({
    gameType: gameTypeValidator,
    competitorKey: v.string(),
    displayName: v.string(),
    shortName: v.string(),
    type: playerTypeValidator,
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
    playerType: playerTypeValidator,
    modelId: v.optional(v.string()),
    votePct: v.number(),
    voteCount: v.number(),
    totalVotes: v.number(),
    createdAt: v.number(),
  }).index("by_gameType_and_votePct_and_voteCount", ["gameType", "votePct", "voteCount"]),

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
    totalPlayers: v.number(),
    totalPrompts: v.number(),
    totalVotes: v.number(),
    totalTokens: v.number(),
    totalCost: v.number(),
    updatedAt: v.number(),
  }).index("by_gameType", ["gameType"]),

  ...matchslopTables,
  ...quizslopTables,
  ...slopfightTables,
  ...sloplashTables,
});
