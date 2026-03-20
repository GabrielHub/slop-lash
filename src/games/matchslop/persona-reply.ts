import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { generatePersonaReply } from "./ai";
import { parseModeState } from "./game-logic-core";
import type { MatchSlopTranscriptEntry } from "./types";

const inflightReplies = new Map<string, Promise<void>>();

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function newGenerationId(): string {
  return crypto.randomUUID();
}

async function updateModeState(
  gameId: string,
  resolveModeState: (
    modeState: ReturnType<typeof parseModeState>,
  ) => ReturnType<typeof parseModeState> | null,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        version: true,
        modeState: true,
      },
    });
    if (!game) return false;

    const modeState = parseModeState(game.modeState);
    const nextModeState = resolveModeState(modeState);
    if (!nextModeState) return false;

    const updated = await prisma.game.updateMany({
      where: {
        id: gameId,
        version: game.version,
      },
      data: {
        modeState: toJson(nextModeState),
        version: { increment: 1 },
      },
    });

    if (updated.count > 0) {
      return true;
    }
  }

  return false;
}

async function claimReplyGeneration(gameId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        version: true,
        status: true,
        currentRound: true,
        totalRounds: true,
        personaModelId: true,
        modeState: true,
      },
    });
    if (!game?.personaModelId) return null;
    if (game.status !== "ROUND_RESULTS") return null;

    const modeState = parseModeState(game.modeState);
    if (modeState.pendingPersonaReply.status !== "NOT_REQUESTED") return null;
    if (!modeState.profile || !modeState.lastRoundResult) return null;

    const generationId = newGenerationId();
    const claimed = await prisma.game.updateMany({
      where: {
        id: gameId,
        version: game.version,
      },
      data: {
        modeState: toJson({
          ...modeState,
          pendingPersonaReply: {
            status: "GENERATING",
            reply: null,
            outcome: null,
            moodDelta: null,
            generationId,
          },
        }),
        version: { increment: 1 },
      },
    });

    if (claimed.count > 0) {
      return {
        generationId,
        personaModelId: game.personaModelId,
        currentRound: game.currentRound,
        totalRounds: game.totalRounds,
        modeState,
      };
    }
  }

  return null;
}

async function finalizeReply(
  gameId: string,
  generationId: string,
  reply: string,
  outcome: "CONTINUE" | "DATE_SEALED" | "UNMATCHED",
  moodDelta: number,
): Promise<boolean> {
  return updateModeState(gameId, (modeState) => {
    if (modeState.pendingPersonaReply.status !== "GENERATING") return null;
    if (modeState.pendingPersonaReply.generationId !== generationId) return null;

    return {
      ...modeState,
      pendingPersonaReply: {
        status: "READY",
        reply,
        outcome,
        moodDelta,
        generationId,
      },
    };
  });
}

async function markReplyFailed(
  gameId: string,
  generationId: string,
): Promise<void> {
  const updated = await updateModeState(gameId, (modeState) => {
    if (modeState.pendingPersonaReply.status !== "GENERATING") return null;
    if (modeState.pendingPersonaReply.generationId !== generationId) return null;

    return {
      ...modeState,
      pendingPersonaReply: {
        status: "FAILED",
        reply: null,
        outcome: null,
        moodDelta: null,
        generationId,
      },
    };
  });

  if (updated) {
    await publishGameStateEvent(gameId).catch(() => undefined);
  }
}

export async function ensurePersonaReply(gameId: string): Promise<void> {
  const existing = inflightReplies.get(gameId);
  if (existing) return existing;

  const promise = doEnsurePersonaReply(gameId).finally(() => {
    inflightReplies.delete(gameId);
  });
  inflightReplies.set(gameId, promise);
  return promise;
}

async function doEnsurePersonaReply(gameId: string): Promise<void> {
  const claim = await claimReplyGeneration(gameId);
  if (!claim) return;

  const { generationId, modeState } = claim;
  // Publish so UI shows typing indicator immediately
  await publishGameStateEvent(gameId).catch(() => undefined);

  if (!modeState.profile || !modeState.lastRoundResult) {
    await markReplyFailed(gameId, generationId);
    return;
  }

  try {
    const winnerEntry: MatchSlopTranscriptEntry = {
      id: `players-turn-${claim.currentRound}`,
      speaker: "PLAYERS",
      text: modeState.lastRoundResult.winnerText,
      turn: claim.currentRound,
      outcome: null,
      authorName: modeState.lastRoundResult.authorName,
      selectedPromptText:
        claim.currentRound === 1
          ? (modeState.lastRoundResult.selectedPromptText ?? null)
          : null,
      selectedPromptId:
        claim.currentRound === 1
          ? (modeState.lastRoundResult.selectedPromptId ?? null)
          : null,
    };
    const transcriptWithWinner = [...modeState.transcript, winnerEntry];
    const forceContinue = claim.currentRound === 1;

    const { reply, outcome, moodDelta, usage } = await generatePersonaReply(
      claim.personaModelId,
      modeState.seekerIdentity,
      modeState.personaIdentity,
      modeState.profile,
      transcriptWithWinner,
      { forceContinue, currentMood: modeState.mood },
    );
    const [, finalized] = await Promise.all([
      accumulateUsage(gameId, [usage]),
      finalizeReply(gameId, generationId, reply, outcome, moodDelta),
    ]);
    if (!finalized) return;

    await publishGameStateEvent(gameId).catch(() => undefined);
  } catch (error) {
    console.error(`[matchslop:ensurePersonaReply] ${gameId} failed:`, error);
    await markReplyFailed(gameId, generationId);
  }
}
