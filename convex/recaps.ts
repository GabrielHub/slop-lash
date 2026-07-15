import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { isWinnerTaglinePending } from "./winnerTaglineData";
import { gameModeStateValidator } from "./matchslopValidators";
import {
  gameStatusValidator,
  gameTypeValidator,
  participationStatusValidator,
  playerTypeValidator,
  ttsModeValidator,
} from "./validators";

const MAX_PLAYERS = 16;
const MAX_ROUNDS = 10;
const MAX_PROMPTS_PER_ROUND = 32;
const MAX_ASSIGNMENTS_PER_ROUND = 256;
const MAX_RESPONSES_PER_ROUND = 256;
const MAX_VOTES_PER_ROUND = 1_024;
const MAX_REACTIONS = 4_096;
const MAX_MODEL_USAGES = 64;

const responsePlayerValidator = v.object({
  id: v.id("players"),
  name: v.string(),
  type: playerTypeValidator,
  modelId: v.union(v.string(), v.null()),
  idleRounds: v.number(),
  humorRating: v.number(),
  winStreak: v.number(),
  participationStatus: participationStatusValidator,
  lastSeen: v.string(),
});

const playerValidator = v.object({
  ...responsePlayerValidator.fields,
  score: v.number(),
});

const reactionValidator = v.object({
  id: v.id("reactions"),
  responseId: v.id("responses"),
  playerId: v.id("players"),
  emoji: v.string(),
});

const responseValidator = v.object({
  id: v.id("responses"),
  promptId: v.id("prompts"),
  playerId: v.id("players"),
  metadata: v.union(v.record(v.string(), v.any()), v.null()),
  text: v.string(),
  pointsEarned: v.number(),
  failReason: v.union(v.string(), v.null()),
  reactions: v.array(reactionValidator),
  player: responsePlayerValidator,
});

const voteValidator = v.object({
  id: v.id("votes"),
  promptId: v.id("prompts"),
  voterId: v.id("players"),
  responseId: v.union(v.id("responses"), v.null()),
  failReason: v.union(v.string(), v.null()),
  voter: v.object({ id: v.id("players"), type: playerTypeValidator }),
});

const promptValidator = v.object({
  id: v.id("prompts"),
  roundId: v.id("rounds"),
  text: v.string(),
  assignments: v.array(v.object({ promptId: v.id("prompts"), playerId: v.id("players") })),
  responses: v.array(responseValidator),
  votes: v.array(voteValidator),
});

const roundValidator = v.object({
  id: v.id("rounds"),
  gameId: v.id("games"),
  roundNumber: v.number(),
  prompts: v.array(promptValidator),
});

const recapGameValidator = v.object({
  id: v.id("games"),
  roomCode: v.string(),
  gameType: gameTypeValidator,
  personaModelId: v.union(v.string(), v.null()),
  modeState: gameModeStateValidator,
  status: v.literal("FINAL_RESULTS"),
  currentRound: v.number(),
  totalRounds: v.number(),
  hostPlayerId: v.union(v.id("players"), v.null()),
  phaseDeadline: v.union(v.string(), v.null()),
  timersDisabled: v.boolean(),
  ttsMode: ttsModeValidator,
  ttsVoice: v.string(),
  votingPromptIndex: v.number(),
  votingRevealing: v.boolean(),
  nextGameCode: v.union(v.string(), v.null()),
  winnerTagline: v.union(v.string(), v.null()),
  winnerTaglinePending: v.boolean(),
  version: v.number(),
  aiInputTokens: v.number(),
  aiOutputTokens: v.number(),
  aiCostUsd: v.number(),
  modelUsages: v.array(
    v.object({
      modelId: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      costUsd: v.number(),
    }),
  ),
  players: v.array(playerValidator),
  rounds: v.array(roundValidator),
});

function publicPlayer(player: Doc<"players">) {
  return {
    id: player._id,
    name: player.name,
    type: player.type,
    modelId: player.modelId ?? null,
    idleRounds: player.idleRounds,
    score: player.score,
    humorRating: player.humorRating,
    winStreak: player.winStreak,
    participationStatus: player.participationStatus,
    lastSeen: new Date(player.joinedAt).toISOString(),
  };
}

function responsePlayer(player: Doc<"players">) {
  const { score: _score, ...publicFields } = publicPlayer(player);
  return publicFields;
}

async function loadModeState(ctx: QueryCtx, game: Doc<"games">) {
  if (game.gameType !== "MATCHSLOP") return null;
  const [state, transcript] = await Promise.all([
    ctx.db
      .query("matchSlopState")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .unique(),
    ctx.db
      .query("matchSlopTranscriptEntries")
      .withIndex("by_gameId_and_turn_and_ordinal", (index) => index.eq("gameId", game._id))
      .take(64),
  ]);
  if (!state) return null;
  return {
    aiVoteWeight: state.aiVoteWeight,
    comebackRound: state.comebackRound ?? null,
    humanVoteWeight: state.humanVoteWeight,
    lastRoundResult: state.lastRoundResult ?? null,
    latestMoodDelta: state.latestMoodDelta ?? null,
    latestNextSignal: state.latestNextSignal ?? null,
    latestSideComment: state.latestSideComment ?? null,
    latestSignalCategory: state.latestSignalCategory ?? null,
    mood: state.mood,
    outcome: state.outcome,
    pendingPersonaReply: state.pendingPersonaReply ?? null,
    personaIdentity: state.personaIdentity,
    personaImage: state.personaImage ?? null,
    postMortem: state.postMortem ?? null,
    postMortemDraft: state.postMortemDraft ?? null,
    postMortemGeneration: state.postMortemGeneration ?? null,
    profile: state.profile ?? null,
    profileDraft: state.profileDraft ?? null,
    profileGeneration: state.profileGeneration ?? null,
    seekerIdentity: state.seekerIdentity,
    selectedPersonaExampleIds: state.selectedPersonaExampleIds,
    selectedPlayerExamples: state.selectedPlayerExamples,
    transcript: transcript.map((entry) => ({
      authorName: entry.authorName ?? null,
      id: entry._id,
      mood: entry.mood ?? null,
      outcome: entry.outcome ?? null,
      selectedPromptId: entry.selectedPromptId ?? null,
      selectedPromptText: entry.selectedPromptText ?? null,
      speaker: entry.speaker,
      text: entry.text,
      turn: entry.turn,
    })),
  };
}

async function loadRounds(
  ctx: QueryCtx,
  game: Doc<"games">,
  playersById: Map<Id<"players">, Doc<"players">>,
) {
  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_gameId_and_roundNumber", (index) => index.eq("gameId", game._id))
    .take(MAX_ROUNDS);
  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_gameId_and_createdAt", (index) => index.eq("gameId", game._id))
    .take(MAX_REACTIONS);
  const reactionsByResponse = new Map<Id<"responses">, Doc<"reactions">[]>();
  for (const reaction of reactions) {
    const grouped = reactionsByResponse.get(reaction.responseId) ?? [];
    grouped.push(reaction);
    reactionsByResponse.set(reaction.responseId, grouped);
  }
  // Rounds are independent, so load them together rather than one batch per round.
  return Promise.all(
    rounds
      .toSorted((left, right) => left.roundNumber - right.roundNumber)
      .map(async (round) => {
        const [prompts, assignments, responses, votes] = await Promise.all([
          ctx.db
            .query("prompts")
            .withIndex("by_gameId_and_roundId", (index) =>
              index.eq("gameId", game._id).eq("roundId", round._id),
            )
            .take(MAX_PROMPTS_PER_ROUND),
          ctx.db
            .query("promptAssignments")
            .withIndex("by_gameId_and_roundId", (index) =>
              index.eq("gameId", game._id).eq("roundId", round._id),
            )
            .take(MAX_ASSIGNMENTS_PER_ROUND),
          ctx.db
            .query("responses")
            .withIndex("by_gameId_and_roundId", (index) =>
              index.eq("gameId", game._id).eq("roundId", round._id),
            )
            .take(MAX_RESPONSES_PER_ROUND),
          ctx.db
            .query("votes")
            .withIndex("by_gameId_and_roundId", (index) =>
              index.eq("gameId", game._id).eq("roundId", round._id),
            )
            .take(MAX_VOTES_PER_ROUND),
        ]);

        return {
          id: round._id,
          gameId: game._id,
          roundNumber: round.roundNumber,
          prompts: prompts
            .toSorted((left, right) => left.ordinal - right.ordinal)
            .map((prompt) => ({
              id: prompt._id,
              roundId: round._id,
              text: prompt.text,
              assignments: assignments
                .filter((assignment) => assignment.promptId === prompt._id)
                .map((assignment) => ({
                  promptId: assignment.promptId,
                  playerId: assignment.playerId,
                })),
              responses: responses
                .filter((response) => response.promptId === prompt._id)
                .flatMap((response) => {
                  const player = playersById.get(response.playerId);
                  if (!player) return [];
                  return [
                    {
                      id: response._id,
                      promptId: response.promptId,
                      playerId: response.playerId,
                      metadata: response.metadata ?? null,
                      text: response.text,
                      pointsEarned: response.pointsEarned,
                      failReason: response.failReason ?? null,
                      reactions: (reactionsByResponse.get(response._id) ?? []).map((reaction) => ({
                        id: reaction._id,
                        responseId: reaction.responseId,
                        playerId: reaction.playerId,
                        emoji: reaction.emoji,
                      })),
                      player: responsePlayer(player),
                    },
                  ];
                }),
              votes: votes
                .filter((vote) => vote.promptId === prompt._id)
                .flatMap((vote) => {
                  const voter = playersById.get(vote.voterId);
                  if (!voter) return [];
                  return [
                    {
                      id: vote._id,
                      promptId: vote.promptId,
                      voterId: vote.voterId,
                      responseId: vote.responseId ?? null,
                      failReason: vote.failReason ?? null,
                      voter: { id: voter._id, type: voter.type },
                    },
                  ];
                }),
            })),
        };
      }),
  );
}

export const getByRoomCode = query({
  args: { roomCode: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("NOT_FOUND") }),
    v.object({ kind: v.literal("IN_PROGRESS"), status: gameStatusValidator }),
    v.object({ kind: v.literal("READY"), game: recapGameValidator }),
  ),
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_roomCode", (index) => index.eq("roomCode", args.roomCode.trim().toUpperCase()))
      .unique();
    if (!game) return { kind: "NOT_FOUND" as const };
    if (game.status !== "FINAL_RESULTS") {
      return { kind: "IN_PROGRESS" as const, status: game.status };
    }

    const [players, modelUsages, nextGame, modeState] = await Promise.all([
      ctx.db
        .query("players")
        .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
        .take(MAX_PLAYERS),
      ctx.db
        .query("gameModelUsage")
        .withIndex("by_gameId_and_modelId", (index) => index.eq("gameId", game._id))
        .take(MAX_MODEL_USAGES),
      game.nextGameId ? ctx.db.get("games", game.nextGameId) : Promise.resolve(null),
      loadModeState(ctx, game),
    ]);
    const playersById = new Map(players.map((player) => [player._id, player]));
    const [rounds, winnerTaglinePending] = await Promise.all([
      loadRounds(ctx, game, playersById),
      isWinnerTaglinePending(ctx.db, game, players),
    ]);

    return {
      kind: "READY" as const,
      game: {
        id: game._id,
        roomCode: game.roomCode,
        gameType: game.gameType,
        personaModelId: game.personaModelId ?? null,
        modeState,
        status: "FINAL_RESULTS" as const,
        currentRound: game.currentRound,
        totalRounds: game.totalRounds,
        hostPlayerId: game.hostPlayerId ?? null,
        phaseDeadline: game.phaseDeadline ? new Date(game.phaseDeadline).toISOString() : null,
        timersDisabled: game.timersDisabled,
        ttsMode: game.ttsMode,
        ttsVoice: game.ttsVoice,
        votingPromptIndex: game.votingPromptIndex,
        votingRevealing: game.votingRevealing,
        nextGameCode: nextGame?.roomCode ?? null,
        winnerTagline: game.winnerTagline ?? null,
        winnerTaglinePending,
        version: game.phaseGeneration,
        aiInputTokens: game.aiInputTokens,
        aiOutputTokens: game.aiOutputTokens,
        aiCostUsd: game.aiCostUsd,
        modelUsages: modelUsages
          .map((usage) => ({
            modelId: usage.modelId,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costUsd: usage.costUsd,
          }))
          .toSorted((left, right) => right.costUsd - left.costUsd),
        players: players
          .map(publicPlayer)
          .toSorted((left, right) => right.score - left.score || left.id.localeCompare(right.id)),
        rounds,
      },
    };
  },
});
