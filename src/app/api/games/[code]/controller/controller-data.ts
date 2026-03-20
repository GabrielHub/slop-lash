import type { GameStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { FORFEIT_MARKER } from "@/games/core/constants";
import type { ControllerGameState } from "@/lib/controller-types";
import { asRecord, asString, asNumber } from "@/lib/json-guards";
import { parseDetails } from "@/games/matchslop/game-logic-core";
import { isPromptVotable } from "../route-helpers";
import {
  findGameMeta,
  findGamePayloadByStatus,
  normalizePayload,
  type GameRoutePayload,
} from "../route-data";

function asPromptOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const id = asString(record.id);
      const prompt = asString(record.prompt);
      const answer = asString(record.answer);
      if (!id || !prompt || !answer) return null;
      return { id, prompt, answer };
    })
    .filter((item): item is { id: string; prompt: string; answer: string } => item != null);
}

function asTranscript(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;
      const speaker = record.speaker === "PERSONA" ? "PERSONA" : "PLAYERS";
      const text = asString(record.text);
      if (!text) return null;
      const turn = asNumber(record.turn) ?? index + 1;
      const outcomeRaw = asString(record.outcome);
      const outcome =
        outcomeRaw === "CONTINUE" ||
        outcomeRaw === "DATE_SEALED" ||
        outcomeRaw === "UNMATCHED" ||
        outcomeRaw === "TURN_LIMIT" ||
        outcomeRaw === "COMEBACK"
          ? outcomeRaw
          : null;
      return {
        id: asString(record.id) ?? `entry-${index}`,
        speaker,
        text,
        turn,
        outcome,
        authorName: asString(record.authorName),
      };
    })
    .filter((item): item is {
      id: string;
      speaker: "PLAYERS" | "PERSONA";
      text: string;
      turn: number;
      outcome: "CONTINUE" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT" | "COMEBACK" | null;
      authorName: string | null;
    } => item != null);
}

export const controllerMetaSelect = {
  id: true,
  gameType: true,
  status: true,
  version: true,
  phaseDeadline: true,
  hostPlayerId: true,
  hostControlLastSeen: true,
} as const satisfies Prisma.GameSelect;

export type ControllerMetaPayload = Prisma.GameGetPayload<{ select: typeof controllerMetaSelect }>;

export function findControllerMeta(roomCode: string) {
  return prisma.game.findUnique({
    where: { roomCode },
    select: controllerMetaSelect,
  });
}

function projectControllerPayload(
  game: GameRoutePayload,
  playerId: string | null,
): ControllerGameState {
  const players = game.players
    .map((player) => ({
      id: player.id,
      name: player.name,
      type: player.type,
      participationStatus: player.participationStatus,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
  const me = playerId ? players.find((p) => p.id === playerId) ?? null : null;
  const currentRound =
    game.rounds.find((round) => round.roundNumber === game.currentRound) ?? game.rounds[0] ?? null;
  const modeState = asRecord(game.modeState);

  let writing: ControllerGameState["writing"] = null;
  if (game.status === "WRITING" && currentRound && playerId && me?.type !== "AI") {
    const prompts = currentRound.prompts
      .filter((p) => p.assignments.some((a) => a.playerId === playerId))
      .map((p) => ({
        id: p.id,
        text: p.text,
        submitted: p.responses.some((r) => r.playerId === playerId),
      }));
    writing = { prompts };
  }

  let voting: ControllerGameState["voting"] = null;
  if (game.status === "VOTING" && currentRound) {
    const votablePrompts = currentRound.prompts.filter(
      (p) => isPromptVotable(game.gameType, p),
    );
    const currentPrompt = votablePrompts[game.votingPromptIndex] ?? null;

    if (currentPrompt && playerId) {
      const isRespondent = currentPrompt.responses.some((r) => r.playerId === playerId);
      const ownVote = currentPrompt.votes.find((v) => v.voterId === playerId) ?? null;
      voting = {
        totalPrompts: game.gameType === "MATCHSLOP" ? 1 : votablePrompts.length,
        currentPrompt: (() => {
          const votableResponses = currentPrompt.responses.filter((r) => r.text !== FORFEIT_MARKER);
          return {
            id: currentPrompt.id,
            text: currentPrompt.text,
            responses: votableResponses.map((r) => ({
              id: r.id,
              text: r.text,
            })),
            isRespondent,
            hasVoted: ownVote != null,
            hasAbstained:
              ownVote != null &&
              ownVote.responseId == null &&
              ownVote.failReason == null,
            forfeitCount: currentPrompt.responses.length - votableResponses.length,
          };
        })(),
      };
    } else {
      voting = {
        totalPrompts: votablePrompts.length,
        currentPrompt: null,
      };
    }
  }

  let matchslop: ControllerGameState["matchslop"] = null;
  if (game.gameType === "MATCHSLOP") {
    const profile = asRecord(modeState?.profile);
    const profilePrompts = asPromptOptions(profile?.prompts);
    const image = asRecord(modeState?.personaImage);

    const latestAssignedPrompt =
      currentRound?.prompts.find((p) => p.assignments.some((a) => a.playerId === playerId)) ??
      currentRound?.prompts[0] ??
      null;
    const latestPlayerResponse = latestAssignedPrompt?.responses.find((r) => r.playerId === playerId) ?? null;

    let matchslopWriting: NonNullable<ControllerGameState["matchslop"]>["writing"] = null;
    if (game.status === "WRITING" && latestAssignedPrompt && playerId && me?.type !== "AI") {
      matchslopWriting = {
        promptId: latestAssignedPrompt.id,
        text: latestAssignedPrompt.text,
        submitted: latestPlayerResponse != null,
        openerOptions: game.currentRound === 1 ? profilePrompts : [],
      };
    }

    const currentVotePrompt =
      game.status === "VOTING" && currentRound
        ? currentRound.prompts[game.votingPromptIndex] ?? null
        : null;
    if (voting?.currentPrompt && currentVotePrompt && playerId) {
      const filteredResponses = currentVotePrompt.responses
        .filter((r) => r.text !== FORFEIT_MARKER && r.playerId !== playerId)
        .map((r) => {
          const metadata = asRecord(r.metadata);
          return {
            id: r.id,
            text: r.text,
            openerPromptId: asString(metadata?.selectedPromptId),
          };
        });
      voting = {
        totalPrompts: 1,
        currentPrompt: {
          ...voting.currentPrompt,
          responses: filteredResponses,
          isRespondent: false,
          hasAbstained:
            currentVotePrompt.votes.some((v) => v.voterId === playerId && v.responseId == null && v.failReason == null),
          forfeitCount: currentVotePrompt.responses.filter((r) => r.text === FORFEIT_MARKER).length,
        },
      };
    }

    const outcomeRaw = asString(modeState?.outcome);
    const outcome =
      outcomeRaw === "DATE_SEALED" ||
      outcomeRaw === "UNMATCHED" ||
      outcomeRaw === "TURN_LIMIT" ||
      outcomeRaw === "COMEBACK"
        ? outcomeRaw
        : "IN_PROGRESS" as const;

    const profileGenerationStatusRaw = asString(asRecord(modeState?.profileGeneration)?.status);
    const profileGenerationStatus =
      profileGenerationStatusRaw === "STREAMING" ||
      profileGenerationStatusRaw === "READY" ||
      profileGenerationStatusRaw === "FAILED"
        ? profileGenerationStatusRaw
        : "NOT_REQUESTED";
    const profileGeneration: NonNullable<
      NonNullable<ControllerGameState["matchslop"]>["profileGeneration"]
    > = {
      status: profileGenerationStatus,
      updatedAt:
        asString(asRecord(modeState?.profileGeneration)?.updatedAt) ??
        new Date(0).toISOString(),
    };

    const imageStatus = asString(image?.status);
    const resolvedImageStatus =
      imageStatus === "PENDING" ||
      imageStatus === "PROCESSING" ||
      imageStatus === "READY" ||
      imageStatus === "FAILED"
        ? imageStatus
        : "NOT_REQUESTED" as const;

    matchslop = {
      seekerIdentity: asString(modeState?.seekerIdentity),
      personaIdentity: asString(modeState?.personaIdentity),
      outcome,
      humanVoteWeight: asNumber(modeState?.humanVoteWeight) ?? 2,
      aiVoteWeight: asNumber(modeState?.aiVoteWeight) ?? 1,
      comebackRound: asNumber(modeState?.comebackRound) ?? null,
      profile: profile
        ? {
            displayName: asString(profile.displayName) ?? "Mystery Match",
            age: asNumber(profile.age),
            location: asString(profile.location),
            bio: asString(profile.bio),
            tagline: asString(profile.tagline),
            prompts: profilePrompts,
            details: parseDetails(profile.details),
            image: {
              status: resolvedImageStatus,
              imageUrl: asString(image?.imageUrl),
            },
          }
        : null,
      profileGeneration,
      transcript: asTranscript(modeState?.transcript),
      writing: matchslopWriting,
    };
  }

  return {
    id: game.id,
    roomCode: game.roomCode,
    gameType: game.gameType,
    status: game.status,
    currentRound: game.currentRound,
    totalRounds: game.totalRounds,
    hostPlayerId: game.hostPlayerId,
    phaseDeadline: game.phaseDeadline?.toISOString() ?? null,
    timersDisabled: game.timersDisabled,
    votingPromptIndex: game.votingPromptIndex,
    votingRevealing: game.votingRevealing,
    nextGameCode: game.nextGameCode,
    version: game.version,
    players,
    me,
    writing,
    voting,
    matchslop,
  };
}

export async function findControllerPayload(
  roomCode: string,
  playerId: string | null,
  version?: number,
  status?: GameStatus,
): Promise<ControllerGameState | null> {
  const resolvedStatus = status ?? (await findGameMeta(roomCode))?.status;
  if (!resolvedStatus) return null;

  const rawGame = await findGamePayloadByStatus(
    roomCode,
    resolvedStatus,
    version == null ? undefined : `controller:${version}`,
  );
  if (!rawGame) return null;

  return projectControllerPayload(normalizePayload(rawGame), playerId);
}
