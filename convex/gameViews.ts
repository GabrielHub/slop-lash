import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { FORFEIT_MARKER } from "../src/games/core/constants";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { isPromptVotable } from "../src/games/core/votability";
import { requireCapability } from "./capabilities";
import {
  loadCurrentRound,
  loadModeState,
  loadPlayers,
  loadStageRounds,
  mapPublicPlayer,
  optionalString,
} from "./gameViewData";
import {
  controllerViewValidator,
  lobbyViewValidator,
  stageViewValidator,
} from "./gameViewValidators";
import { getVotableSloplashPrompts } from "./sloplashEngine";
import { isWinnerTaglinePending } from "./winnerTaglineData";

const MAX_MODEL_USAGES = 32;

async function loadStageViewData(ctx: QueryCtx, capability: string) {
  const authorized = await requireCapability(ctx, capability);
  const [players, modeState, modelUsages, nextGame] = await Promise.all([
    loadPlayers(ctx, authorized.game._id),
    loadModeState(ctx, authorized.game),
    ctx.db
      .query("gameModelUsage")
      .withIndex("by_gameId_and_modelId", (index) => index.eq("gameId", authorized.game._id))
      .take(MAX_MODEL_USAGES),
    authorized.game.nextGameId
      ? ctx.db.get("games", authorized.game.nextGameId)
      : Promise.resolve(null),
  ]);
  return { authorized, modeState, modelUsages, nextGame, players };
}

function mapStageView(
  data: Awaited<ReturnType<typeof loadStageViewData>>,
  winnerTaglinePending: boolean,
) {
  const { authorized, modeState, modelUsages, nextGame, players } = data;
  return {
    aiCostUsd: authorized.game.aiCostUsd,
    aiInputTokens: authorized.game.aiInputTokens,
    aiOutputTokens: authorized.game.aiOutputTokens,
    currentRound: authorized.game.currentRound,
    gameType: authorized.game.gameType,
    hostPlayerId: authorized.game.hostPlayerId ?? null,
    id: authorized.game._id,
    me: {
      isHost:
        authorized.session.role === "HOST" &&
        authorized.game.hostSessionId === authorized.session._id,
      playerId: authorized.player?._id ?? null,
      role: authorized.session.role,
      sessionId: authorized.session._id,
    },
    modeState,
    modelUsages: modelUsages.map((usage) => ({
      costUsd: usage.costUsd,
      inputTokens: usage.inputTokens,
      modelId: usage.modelId,
      outputTokens: usage.outputTokens,
    })),
    nextGameCode: nextGame?.roomCode ?? null,
    personaModelId: authorized.game.personaModelId ?? null,
    phaseDeadline: authorized.game.phaseDeadline
      ? new Date(authorized.game.phaseDeadline).toISOString()
      : null,
    players: players
      .map(mapPublicPlayer)
      .toSorted((left, right) => right.score - left.score || left.id.localeCompare(right.id)),
    roomCode: authorized.game.roomCode,
    status: authorized.game.status,
    timersDisabled: authorized.game.timersDisabled,
    totalRounds: authorized.game.totalRounds,
    ttsMode: authorized.game.ttsMode,
    ttsVoice: authorized.game.ttsVoice,
    version: authorized.game.phaseGeneration,
    votingPromptIndex: authorized.game.votingPromptIndex,
    votingRevealing: authorized.game.votingRevealing,
    winnerTagline: authorized.game.winnerTagline ?? null,
    winnerTaglinePending,
  };
}

export const lobby = query({
  args: { capability: v.string() },
  returns: lobbyViewValidator,
  handler: async (ctx, args) => {
    const data = await loadStageViewData(ctx, args.capability);
    const winnerTaglinePending = await isWinnerTaglinePending(
      ctx.db,
      data.authorized.game,
      data.players,
    );
    return { ...mapStageView(data, winnerTaglinePending), rounds: [] };
  },
});

/** Reactive stage payload; final results include every completed round. */
export const stage = query({
  args: { capability: v.string() },
  returns: stageViewValidator,
  handler: async (ctx, args) => {
    const data = await loadStageViewData(ctx, args.capability);
    const [rounds, winnerTaglinePending] = await Promise.all([
      loadStageRounds(ctx, data.authorized.game, data.players, data.authorized.player?._id ?? null),
      isWinnerTaglinePending(ctx.db, data.authorized.game, data.players),
    ]);
    return {
      ...mapStageView(data, winnerTaglinePending),
      rounds,
      serverNow: new Date().toISOString(),
    };
  },
});

export const controller = query({
  args: { capability: v.string() },
  returns: controllerViewValidator,
  handler: async (ctx, args) => {
    const authorized = await requireCapability(ctx, args.capability);
    const [players, currentRound, matchState, nextGame] = await Promise.all([
      loadPlayers(ctx, authorized.game._id),
      loadCurrentRound(ctx, authorized.game),
      loadModeState(ctx, authorized.game),
      authorized.game.nextGameId
        ? ctx.db.get("games", authorized.game.nextGameId)
        : Promise.resolve(null),
    ]);
    const sortedPlayers = players
      .map((player) => ({
        id: player._id,
        name: player.name,
        participationStatus: player.participationStatus,
        type: player.type,
      }))
      .toSorted((left, right) => left.name.localeCompare(right.name));
    const me = authorized.player
      ? (sortedPlayers.find((player) => player.id === authorized.player?._id) ?? null)
      : null;

    let writing = null;
    if (
      authorized.game.status === "WRITING" &&
      currentRound &&
      authorized.player &&
      authorized.player.type !== "AI"
    ) {
      writing = {
        prompts: currentRound.prompts
          .filter((prompt) =>
            currentRound.assignments.some(
              (assignment) =>
                assignment.promptId === prompt._id &&
                assignment.playerId === authorized.player?._id,
            ),
          )
          .map((prompt) => ({
            id: prompt._id,
            submitted: currentRound.responses.some(
              (response) =>
                response.promptId === prompt._id && response.playerId === authorized.player?._id,
            ),
            text: prompt.text,
          })),
      };
    }

    let voting = null;
    if (authorized.game.status === "VOTING" && currentRound) {
      const votablePrompts =
        authorized.game.gameType === "SLOPLASH"
          ? getVotableSloplashPrompts(currentRound)
          : currentRound.prompts.filter((prompt) =>
              isPromptVotable(
                authorized.game.gameType,
                currentRound.responses.filter((response) => response.promptId === prompt._id),
              ),
            );
      const currentPrompt = votablePrompts[authorized.game.votingPromptIndex] ?? null;
      const promptResponses = currentPrompt
        ? currentRound.responses.filter(
            (response) =>
              response.promptId === currentPrompt._id && response.text !== FORFEIT_MARKER,
          )
        : [];
      const ownVote = authorized.player
        ? currentRound.votes.find(
            (vote) =>
              vote.promptId === currentPrompt?._id && vote.voterId === authorized.player?._id,
          )
        : null;
      voting = {
        currentPrompt:
          currentPrompt && authorized.player
            ? {
                forfeitCount: currentRound.responses.filter(
                  (response) =>
                    response.promptId === currentPrompt._id && response.text === FORFEIT_MARKER,
                ).length,
                hasAbstained:
                  ownVote !== undefined &&
                  ownVote !== null &&
                  ownVote.responseId === undefined &&
                  ownVote.failReason === undefined,
                hasVoted: ownVote !== undefined && ownVote !== null,
                id: currentPrompt._id,
                isRespondent: currentRound.assignments.some(
                  (assignment) =>
                    assignment.promptId === currentPrompt._id &&
                    assignment.playerId === authorized.player?._id,
                ),
                responses: promptResponses
                  .filter(
                    (response) =>
                      authorized.game.gameType !== "MATCHSLOP" ||
                      response.playerId !== authorized.player?._id,
                  )
                  .map((response) => ({
                    id: response._id,
                    openerPromptId: optionalString(response.metadata?.selectedPromptId) ?? null,
                    text: response.text,
                  })),
                text: currentPrompt.text,
              }
            : null,
        totalPrompts: authorized.game.gameType === "MATCHSLOP" ? 1 : votablePrompts.length,
      };
    }

    const profile = matchState?.profile ?? null;
    const image = matchState?.personaImage ?? null;
    const generation = matchState?.profileGeneration ?? null;
    const firstPrompt = currentRound?.prompts[0] ?? null;
    const profileOptions = profile?.prompts ?? [];
    const activePlayerIds = new Set(
      players.filter(isActiveCompetitor).map((player) => player._id),
    );
    const matchslop =
      authorized.game.gameType === "MATCHSLOP" && matchState
        ? {
            aiVoteWeight: matchState.aiVoteWeight,
            comebackRound: matchState.comebackRound,
            humanVoteWeight: matchState.humanVoteWeight,
            latestMoodDelta: matchState.latestMoodDelta,
            latestNextSignal: matchState.latestNextSignal,
            latestSideComment: matchState.latestSideComment,
            latestSignalCategory: matchState.latestSignalCategory,
            mood: matchState.mood,
            outcome: matchState.outcome,
            personaIdentity: matchState.personaIdentity,
            profile: profile
              ? {
                  age: profile.age,
                  bio: profile.bio,
                  details: profile.details
                    ? {
                        height: profile.details.height,
                        job: profile.details.job,
                        languages: profile.details.languages,
                        school: profile.details.school,
                      }
                    : null,
                  displayName: profile.displayName,
                  image: {
                    imageUrl: image?.imageUrl ?? null,
                    status: image?.status ?? "NOT_REQUESTED",
                  },
                  location: profile.location,
                  prompts: profileOptions,
                  tagline: profile.tagline,
                }
              : null,
            profileGeneration: {
              status: generation?.status ?? "NOT_REQUESTED",
              updatedAt: generation?.updatedAt ?? new Date(0).toISOString(),
            },
            progressCount:
              authorized.game.status === "WRITING" && firstPrompt
                ? {
                    submitted: new Set(
                      currentRound?.responses
                        .filter((response) => response.promptId === firstPrompt._id)
                        .map((response) => response.playerId),
                    ).size,
                    total: players.filter(isActiveCompetitor).length,
                  }
                : null,
            seekerIdentity: matchState.seekerIdentity,
            transcript: matchState.transcript,
            voteProgressCount:
              authorized.game.status === "VOTING" && firstPrompt
                ? {
                    total: activePlayerIds.size,
                    voted: new Set(
                      currentRound?.votes
                        .filter(
                          (vote) =>
                            vote.promptId === firstPrompt._id && activePlayerIds.has(vote.voterId),
                        )
                        .map((vote) => vote.voterId),
                    ).size,
                  }
                : null,
            writing:
              authorized.game.status === "WRITING" &&
              firstPrompt &&
              authorized.player &&
              authorized.player.type !== "AI"
                ? {
                    openerOptions: authorized.game.currentRound === 1 ? profileOptions : [],
                    promptId: firstPrompt._id,
                    submitted:
                      currentRound?.responses.some(
                        (response) =>
                          response.promptId === firstPrompt._id &&
                          response.playerId === authorized.player?._id,
                      ) ?? false,
                    text: firstPrompt.text,
                  }
                : null,
          }
        : null;

    return {
      currentRound: authorized.game.currentRound,
      gameType: authorized.game.gameType,
      hostPlayerId: authorized.game.hostPlayerId ?? null,
      id: authorized.game._id,
      matchslop,
      me,
      nextGameCode: nextGame?.roomCode ?? null,
      phaseDeadline: authorized.game.phaseDeadline
        ? new Date(authorized.game.phaseDeadline).toISOString()
        : null,
      players: sortedPlayers,
      roomCode: authorized.game.roomCode,
      serverNow: new Date().toISOString(),
      status: authorized.game.status,
      timersDisabled: authorized.game.timersDisabled,
      totalRounds: authorized.game.totalRounds,
      version: authorized.game.phaseGeneration,
      voting,
      votingPromptIndex: authorized.game.votingPromptIndex,
      votingRevealing: authorized.game.votingRevealing,
      writing,
    };
  },
});
