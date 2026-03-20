import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { MATCHSLOP_PHOTO_PROMPT_ID, MATCHSLOP_PHOTO_PROMPT_TEXT } from "./config/game-config";
import { simpleHash, ZERO_USAGE, type AiUsage } from "@/games/ai-chat-showdown/ai";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { generateAiFollowup, generateAiFunnyVote, generateAiOpener } from "./ai";
import {
  buildVoteContext,
  parseModeState,
  selectPlayerExamples,
} from "./game-logic-core";
import {
  checkAllResponsesIn,
  checkAllVotesForCurrentPrompt,
  revealCurrentPrompt,
  startVoting,
} from "./game-logic-voting";

function getAiPlayers<T extends { id: string; type: string; modelId: string | null }>(
  players: T[],
): (T & { modelId: string })[] {
  return players.filter(
    (player): player is T & { modelId: string } =>
      player.type === "AI" && player.modelId !== null,
  );
}

const inflightResponses = new Map<string, Promise<void>>();
const inflightVotes = new Map<string, Promise<void>>();
const AI_RESPONSE_TIMEOUT_MS = 20_000;
const AI_VOTE_TIMEOUT_MS = 10_000;

type PendingResponseWrite = {
  playerId: string;
  text: string;
  metadata: Prisma.InputJsonValue | typeof Prisma.DbNull;
  failReason: string | null;
  usage: AiUsage;
};

type PendingVoteWrite = {
  voterId: string;
  responseId: string | null;
  failReason: string | null;
  usage: AiUsage;
};


function getFailReason(error: unknown): "timeout" | "error" {
  return error instanceof Error && error.name === "TimeoutError" ? "timeout" : "error";
}

function buildTimeoutError(label: string, timeoutMs: number): Error {
  const error = new Error(`${label} timed out after ${timeoutMs}ms`);
  error.name = "TimeoutError";
  return error;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(buildTimeoutError(label, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function generateAiResponses(gameId: string): Promise<void> {
  const existing = inflightResponses.get(gameId);
  if (existing) return existing;

  const promise = doGenerateAiResponses(gameId).finally(() => {
    inflightResponses.delete(gameId);
  });
  inflightResponses.set(gameId, promise);
  return promise;
}

async function doGenerateAiResponses(gameId: string): Promise<void> {
  const [game, players, round] = await Promise.all([
    prisma.game.findUnique({
      where: { id: gameId },
      select: { status: true, currentRound: true, modeState: true },
    }),
    prisma.player.findMany({
      where: { gameId },
      select: { id: true, type: true, modelId: true },
    }),
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        roundNumber: true,
        prompts: {
          select: {
            id: true,
            text: true,
            assignments: { select: { playerId: true } },
            responses: { select: { playerId: true } },
          },
        },
      },
    }),
  ]);

  if (!game || !round) return;
  if (game.status !== "WRITING" || game.currentRound !== round.roundNumber) return;
  const prompt = round.prompts[0];
  if (!prompt) return;

  const aiPlayers = getAiPlayers(players);
  if (aiPlayers.length === 0) return;

  const modeState = parseModeState(game.modeState);
  const profile = modeState.profile;
  if (!profile) return;
  const playerExamples =
    modeState.selectedPlayerExamples.length > 0
      ? modeState.selectedPlayerExamples
      : selectPlayerExamples();
  const context = buildVoteContext(profile, modeState.transcript, prompt.text);

  const existingResponders = new Set(prompt.responses.map((response) => response.playerId));
  const responsePromises = prompt.assignments
    .map((assignment) => aiPlayers.find((player) => player.id === assignment.playerId))
    .filter((player): player is (typeof aiPlayers)[number] => player != null)
    .filter((player) => !existingResponders.has(player.id))
    .map(async (player): Promise<PendingResponseWrite> => {
      try {
        const openerResult =
          game.currentRound === 1
            ? await withTimeout(
                generateAiOpener(player.modelId, profile, playerExamples),
                AI_RESPONSE_TIMEOUT_MS,
                `MatchSlop opener for ${player.id}`,
              )
            : null;
        const followupResult =
          game.currentRound === 1
            ? null
            : await withTimeout(
                generateAiFollowup(player.modelId, context, playerExamples),
                AI_RESPONSE_TIMEOUT_MS,
                `MatchSlop follow-up for ${player.id}`,
              );

        const text = openerResult?.text ?? followupResult?.text ?? FORFEIT_MARKER;
        const usage = openerResult?.usage ?? followupResult?.usage ?? { ...ZERO_USAGE, modelId: player.modelId };
        const failReason = openerResult?.failReason ?? followupResult?.failReason ?? null;
        const metadata =
          openerResult != null
            ? ({
                selectedPromptId: openerResult.selectedPromptId,
                selectedPromptText:
                  openerResult.selectedPromptId === MATCHSLOP_PHOTO_PROMPT_ID
                    ? MATCHSLOP_PHOTO_PROMPT_TEXT
                    : profile.prompts.find((profilePrompt) => profilePrompt.id === openerResult.selectedPromptId)?.prompt ?? null,
              } as Prisma.InputJsonValue)
            : Prisma.DbNull;

        return {
          playerId: player.id,
          text,
          metadata,
          failReason,
          usage,
        };
      } catch (error) {
        console.error(`[matchslop:generateAiResponses] ${player.modelId} failed for ${player.id}`, error);

        return {
          playerId: player.id,
          text: FORFEIT_MARKER,
          metadata:
            game.currentRound === 1
              ? ({
                  selectedPromptId: profile.prompts[0]?.id ?? null,
                  selectedPromptText: profile.prompts[0]?.prompt ?? null,
                } as Prisma.InputJsonValue)
              : Prisma.DbNull,
          failReason: getFailReason(error),
          usage: { ...ZERO_USAGE, modelId: player.modelId },
        };
      }
    });

  const successfulWrites = await Promise.all(responsePromises);
  if (successfulWrites.length === 0) return;

  const usages = successfulWrites.map((result) => result.usage);
  await accumulateUsage(gameId, usages);

  const latestGame = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, currentRound: true },
  });
  if (!latestGame || latestGame.status !== "WRITING" || latestGame.currentRound !== round.roundNumber) {
    return;
  }

  for (const response of successfulWrites) {
    try {
      await prisma.response.create({
        data: {
          promptId: prompt.id,
          playerId: response.playerId,
          text: response.text,
          metadata: response.metadata,
          failReason: response.failReason,
        },
      });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2002")) throw error;
    }
  }

  const allIn = await checkAllResponsesIn(gameId);
  if (!allIn) return;

  const claimed = await startVoting(gameId);
  if (claimed) {
    await generateAiVotes(gameId);
  }
}

export async function generateAiVotes(gameId: string): Promise<void> {
  const existing = inflightVotes.get(gameId);
  if (existing) return existing;

  const promise = doGenerateAiVotes(gameId).finally(() => {
    inflightVotes.delete(gameId);
  });
  inflightVotes.set(gameId, promise);
  return promise;
}

async function doGenerateAiVotes(gameId: string): Promise<void> {
  const [game, players, round] = await Promise.all([
    prisma.game.findUnique({
      where: { id: gameId },
      select: { status: true, currentRound: true, votingRevealing: true, modeState: true },
    }),
    prisma.player.findMany({
      where: { gameId },
      select: { id: true, type: true, modelId: true },
    }),
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        roundNumber: true,
        prompts: {
          select: {
            id: true,
            text: true,
            responses: {
              orderBy: { id: "asc" },
              select: { id: true, playerId: true, text: true },
            },
            votes: { select: { voterId: true } },
          },
        },
      },
    }),
  ]);

  if (!game || !round) return;
  if (game.status !== "VOTING" || game.votingRevealing || game.currentRound !== round.roundNumber) return;
  const prompt = round.prompts[0];
  if (!prompt) return;

  const aiPlayers = getAiPlayers(players);
  if (aiPlayers.length === 0) return;

  const modeState = parseModeState(game.modeState);
  const profile = modeState.profile;
  const candidateResponses = prompt.responses.filter((response) => response.text !== FORFEIT_MARKER);
  if (candidateResponses.length === 0) return;

  const existingVoterIds = new Set(prompt.votes.map((vote) => vote.voterId));
  const context = buildVoteContext(profile, modeState.transcript, prompt.text);

  const pendingVoters = aiPlayers.filter((player) => !existingVoterIds.has(player.id));
  const votePromises = pendingVoters.map(async (player): Promise<PendingVoteWrite> => {
    const options = candidateResponses.filter((response) => response.playerId !== player.id);
    if (options.length === 0) {
      return {
        voterId: player.id,
        responseId: null,
        failReason: null,
        usage: { ...ZERO_USAGE, modelId: player.modelId },
      };
    }

    try {
      const vote = await withTimeout(
        generateAiFunnyVote(
          player.modelId,
          context,
          options.map((response) => ({ id: response.id, text: response.text })),
          simpleHash(`${gameId}:${round.roundNumber}:${player.id}`),
        ),
        AI_VOTE_TIMEOUT_MS,
        `MatchSlop vote for ${player.id}`,
      );

      return {
        voterId: player.id,
        responseId: vote.chosenResponseId,
        failReason: vote.failReason,
        usage: vote.usage,
      };
    } catch (error) {
      console.error(`[matchslop:generateAiVotes] ${player.modelId} failed for ${player.id}`, error);

      return {
        voterId: player.id,
        responseId: null,
        failReason: getFailReason(error),
        usage: { ...ZERO_USAGE, modelId: player.modelId },
      };
    }
  });

  const successfulVotes = await Promise.all(votePromises);
  if (successfulVotes.length === 0) return;

  const usages = successfulVotes.map((result) => result.usage);
  await accumulateUsage(gameId, usages);

  const latestGame = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, currentRound: true, votingRevealing: true },
  });
  if (
    !latestGame ||
    latestGame.status !== "VOTING" ||
    latestGame.votingRevealing ||
    latestGame.currentRound !== round.roundNumber
  ) {
    return;
  }

  let writesCompleted = 0;
  for (const vote of successfulVotes) {
    try {
      await prisma.vote.create({
        data: {
          promptId: prompt.id,
          voterId: vote.voterId,
          responseId: vote.responseId,
          failReason: vote.failReason,
        },
      });
      writesCompleted++;
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2002")) throw error;
    }
  }

  if (writesCompleted > 0) {
    await prisma.game.update({
      where: { id: gameId },
      data: { version: { increment: 1 } },
    });
  }

  const allVotesIn = await checkAllVotesForCurrentPrompt(gameId);
  if (allVotesIn) {
    await revealCurrentPrompt(gameId);
  }
}
