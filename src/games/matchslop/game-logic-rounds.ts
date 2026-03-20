import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { generatePersonaProfile, generatePersonaReply } from "./ai";
import {
  buildWritingDeadline,
  buildRoundPromptText,
  getActivePlayerIds,
  isComebackRound,
  parseModeState,
  resolvePersonaExamples,
  selectPersonaExamples,
  selectPlayerExamples,
} from "./game-logic-core";
import type {
  MatchSlopOutcome,
  MatchSlopTranscriptEntry,
  MatchSlopTranscriptOutcome,
} from "./types";
import { DEFAULT_TOTAL_ROUNDS } from "./game-constants";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

type MatchSlopAdvancePlan =
  | {
      kind: "NEXT_ROUND";
      nextRound: number;
      nextOutcome: MatchSlopOutcome;
      transcriptOutcome: MatchSlopTranscriptOutcome;
      comebackRound: number | null;
    }
  | {
      kind: "FINAL_RESULTS";
      nextOutcome: Exclude<MatchSlopOutcome, "IN_PROGRESS">;
      transcriptOutcome: MatchSlopTranscriptOutcome;
      comebackRound: number | null;
    };

export function resolveAdvancePlan(args: {
  currentRound: number;
  totalRounds: number;
  comebackRound: number | null;
  personaOutcome: "CONTINUE" | "DATE_SEALED" | "UNMATCHED";
}): MatchSlopAdvancePlan {
  const { currentRound, totalRounds, comebackRound, personaOutcome } = args;

  if (comebackRound === currentRound) {
    if (personaOutcome === "UNMATCHED") {
      return {
        kind: "FINAL_RESULTS",
        nextOutcome: "UNMATCHED",
        transcriptOutcome: "UNMATCHED",
        comebackRound,
      };
    }

    return {
      kind: "FINAL_RESULTS",
      nextOutcome: "COMEBACK",
      transcriptOutcome: "COMEBACK",
      comebackRound,
    };
  }

  if (personaOutcome === "UNMATCHED") {
    return {
      kind: "NEXT_ROUND",
      nextRound: currentRound + 1,
      nextOutcome: "IN_PROGRESS",
      transcriptOutcome: "UNMATCHED",
      comebackRound: currentRound + 1,
    };
  }

  if (personaOutcome === "CONTINUE" && currentRound < totalRounds) {
    return {
      kind: "NEXT_ROUND",
      nextRound: currentRound + 1,
      nextOutcome: "IN_PROGRESS",
      transcriptOutcome: "CONTINUE",
      comebackRound,
    };
  }

  if (personaOutcome === "CONTINUE") {
    return {
      kind: "FINAL_RESULTS",
      nextOutcome: "TURN_LIMIT",
      transcriptOutcome: "TURN_LIMIT",
      comebackRound,
    };
  }

  return {
    kind: "FINAL_RESULTS",
    nextOutcome: "DATE_SEALED",
    transcriptOutcome: "DATE_SEALED",
    comebackRound,
  };
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
        personaImage: {
          status: "PENDING",
          imageUrl: null,
          updatedAt: new Date().toISOString(),
        },
        transcript: [],
        lastRoundResult: null,
        comebackRound: null,
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
    const fallbackOutcome = isComebackRound(modeState, game.currentRound)
      ? "UNMATCHED"
      : "TURN_LIMIT";
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: "FINAL_RESULTS",
        phaseDeadline: null,
        modeState: toJson({
          ...modeState,
          outcome: fallbackOutcome,
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
  const forceContinue = game.currentRound === 1;

  const { reply, outcome, usage } = await generatePersonaReply(
    game.personaModelId,
    modeState.seekerIdentity,
    modeState.personaIdentity,
    profile,
    transcriptWithWinner,
    { forceContinue },
  );
  await accumulateUsage(gameId, [usage]);

  const advancePlan = resolveAdvancePlan({
    currentRound: game.currentRound,
    totalRounds: game.totalRounds,
    comebackRound: modeState.comebackRound,
    personaOutcome: outcome,
  });
  const personaEntry: MatchSlopTranscriptEntry = {
    id: `persona-turn-${game.currentRound}`,
    speaker: "PERSONA",
    text: reply,
    turn: game.currentRound,
    outcome: advancePlan.transcriptOutcome,
    authorName: profile.displayName,
  };
  const nextTranscript = [...transcriptWithWinner, personaEntry];

  if (advancePlan.kind === "NEXT_ROUND") {
    try {
      await prisma.game.update({
        where: { id: gameId },
        data: {
          modeState: toJson({
            ...modeState,
            transcript: nextTranscript,
            lastRoundResult: null,
            outcome: advancePlan.nextOutcome,
            comebackRound: advancePlan.comebackRound,
          }),
          version: { increment: 1 },
        },
      });
      await createTurnRound(gameId, advancePlan.nextRound);
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
        outcome: advancePlan.nextOutcome,
        comebackRound: advancePlan.comebackRound,
      }),
      version: { increment: 1 },
    },
  });
  return false;
}
