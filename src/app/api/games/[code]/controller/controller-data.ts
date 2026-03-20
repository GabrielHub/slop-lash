import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { FORFEIT_MARKER } from "@/games/core/constants";
import type { ControllerGameState } from "@/lib/controller-types";
import { asRecord, asString, asNumber } from "@/lib/json-guards";
import { parseDetails } from "@/games/matchslop/game-logic-core";
import { createTimedCache } from "@/lib/timed-cache";
import { isPromptVotable } from "../route-helpers";

const CONTROLLER_PAYLOAD_CACHE_TTL_MS = 30_000;
const controllerPayloadCache = createTimedCache(300);

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

export async function findControllerPayload(
  roomCode: string,
  playerId: string | null,
  version?: number,
): Promise<ControllerGameState | null> {
  const controllerGameSelect = {
    id: true,
    roomCode: true,
    gameType: true,
    status: true,
    personaModelId: true,
    modeState: true,
    currentRound: true,
    totalRounds: true,
    hostPlayerId: true,
    phaseDeadline: true,
    timersDisabled: true,
    votingPromptIndex: true,
    votingRevealing: true,
    nextGameCode: true,
    version: true,
    players: {
      select: { id: true, name: true, type: true, participationStatus: true },
      orderBy: { name: "asc" as const },
    },
    rounds: {
      orderBy: { roundNumber: "desc" as const },
      take: 1,
      select: {
        roundNumber: true,
        prompts: {
          orderBy: { id: "asc" as const },
          select: {
            id: true,
            text: true,
            assignments: { select: { playerId: true } },
            responses: {
              select: { id: true, playerId: true, text: true, metadata: true },
              orderBy: { id: "asc" as const },
            },
            votes: {
              select: { voterId: true, responseId: true, failReason: true },
            },
          },
        },
      },
    },
  } as const;

  const cacheKey = version == null ? null : `${roomCode}:${playerId ?? "_"}:${version}`;
  const load = () => prisma.game.findUnique({ where: { roomCode }, select: controllerGameSelect });
  const game = cacheKey
    ? await controllerPayloadCache.getOrLoad(cacheKey, CONTROLLER_PAYLOAD_CACHE_TTL_MS, load)
    : await load();

  if (!game) return null;

  const { players } = game;
  const me = playerId ? players.find((p) => p.id === playerId) ?? null : null;
  const currentRound = game.rounds[0];
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
        currentPrompt: {
          id: currentPrompt.id,
          text: currentPrompt.text,
          responses: currentPrompt.responses
            .filter((r) => r.text !== FORFEIT_MARKER)
            .map((r) => ({
              id: r.id,
              text: r.text,
            })),
          isRespondent,
          hasVoted: ownVote != null,
          hasAbstained:
            ownVote != null &&
            ownVote.responseId == null &&
            ownVote.failReason == null,
        },
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
