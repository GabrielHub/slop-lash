import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { generatePersonaProfile, generatePersonaReply } from "./ai";
import {
  buildWritingDeadline,
  buildRoundPromptText,
  getActivePlayerIds,
  parseModeState,
  resolvePersonaExamples,
  selectPersonaExamples,
  selectPlayerExamples,
} from "./game-logic-core";
import type { MatchSlopTranscriptEntry } from "./types";
import { DEFAULT_TOTAL_ROUNDS } from "./game-constants";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function createTurnRound(gameId: string, roundNumber: number): Promise<void> {
  const [activePlayerIds, game] = await Promise.all([
    getActivePlayerIds(gameId),
    prisma.game.findUnique({
      where: { id: gameId },
      select: { timersDisabled: true, modeState: true },
    }),
  ]);

  if (!game) return;
  const modeState = parseModeState(game.modeState);
  const promptText = buildRoundPromptText(roundNumber, modeState.profile, modeState.transcript);

  await prisma.round.create({
    data: {
      gameId,
      roundNumber,
      prompts: {
        create: [
          {
            text: promptText,
            assignments: {
              create: activePlayerIds.map((playerId) => ({ playerId })),
            },
          },
        ],
      },
    },
  });

  await prisma.game.update({
    where: { id: gameId },
    data: {
      currentRound: roundNumber,
      status: "WRITING",
      votingPromptIndex: 0,
      votingRevealing: false,
      phaseDeadline: buildWritingDeadline(game.timersDisabled),
      version: { increment: 1 },
    },
  });
}

export async function startGame(gameId: string, roundNumber: number): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      personaModelId: true,
      modeState: true,
      totalRounds: true,
    },
  });

  if (!game?.personaModelId) {
    throw new Error("MatchSlop requires personaModelId");
  }

  const modeState = parseModeState(game.modeState);
  const sampledPersonaExamples =
    modeState.selectedPersonaExampleIds.length > 0
      ? resolvePersonaExamples(modeState.selectedPersonaExampleIds)
      : selectPersonaExamples(modeState.personaIdentity);
  const sampledPlayerExamples =
    modeState.selectedPlayerExamples.length > 0
      ? modeState.selectedPlayerExamples
      : selectPlayerExamples();

  const { profile, usage } = await generatePersonaProfile(
    game.personaModelId,
    modeState.seekerIdentity,
    modeState.personaIdentity,
    sampledPersonaExamples,
  );
  await accumulateUsage(gameId, [usage]);

  await prisma.game.update({
    where: { id: gameId },
    data: {
      totalRounds: game.totalRounds > 0 ? game.totalRounds : DEFAULT_TOTAL_ROUNDS,
      modeState: toJson({
        ...modeState,
        selectedPersonaExampleIds: sampledPersonaExamples.map((example) => example.id),
        selectedPlayerExamples: sampledPlayerExamples,
        profile,
        transcript: [],
        lastRoundResult: null,
        outcome: "IN_PROGRESS",
      }),
      version: { increment: 1 },
    },
  });

  await createTurnRound(gameId, roundNumber);
}

export async function advanceGame(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      currentRound: true,
      totalRounds: true,
      personaModelId: true,
      modeState: true,
    },
  });

  if (!game?.personaModelId) return false;

  const modeState = parseModeState(game.modeState);
  const result = modeState.lastRoundResult;
  const profile = modeState.profile;
  if (!result || !profile) {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: "FINAL_RESULTS",
        phaseDeadline: null,
        modeState: toJson({
          ...modeState,
          outcome: "TURN_LIMIT",
          lastRoundResult: null,
        }),
        version: { increment: 1 },
      },
    });
    return false;
  }

  const winnerEntry: MatchSlopTranscriptEntry = {
    id: `players-turn-${game.currentRound}`,
    speaker: "PLAYERS",
    text: result.winnerText,
    turn: game.currentRound,
    outcome: null,
    authorName: result.authorName,
  };
  const transcriptWithWinner = [...modeState.transcript, winnerEntry];

  const { reply, outcome, usage } = await generatePersonaReply(
    game.personaModelId,
    modeState.seekerIdentity,
    modeState.personaIdentity,
    profile,
    transcriptWithWinner,
  );
  await accumulateUsage(gameId, [usage]);

  const isTurnLimit = outcome === "CONTINUE" && game.currentRound >= game.totalRounds;
  const finalOutcome = isTurnLimit ? "TURN_LIMIT" : outcome;
  const personaEntry: MatchSlopTranscriptEntry = {
    id: `persona-turn-${game.currentRound}`,
    speaker: "PERSONA",
    text: reply,
    turn: game.currentRound,
    outcome: finalOutcome === "TURN_LIMIT" ? "TURN_LIMIT" : outcome,
    authorName: profile.displayName,
  };
  const nextTranscript = [...transcriptWithWinner, personaEntry];

  if (outcome === "CONTINUE" && game.currentRound < game.totalRounds) {
    try {
      await prisma.game.update({
        where: { id: gameId },
        data: {
          modeState: toJson({
            ...modeState,
            transcript: nextTranscript,
            lastRoundResult: null,
            outcome: "IN_PROGRESS",
          }),
          version: { increment: 1 },
        },
      });
      await createTurnRound(gameId, game.currentRound + 1);
      return true;
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2002")) throw error;
      return false;
    }
  }

  await prisma.game.update({
    where: { id: gameId },
    data: {
      status: "FINAL_RESULTS",
      phaseDeadline: null,
      modeState: toJson({
        ...modeState,
        transcript: nextTranscript,
        lastRoundResult: result,
        outcome: finalOutcome,
      }),
      version: { increment: 1 },
    },
  });
  return false;
}
