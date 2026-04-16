import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withGameOperationLock } from "@/lib/game-operation-lock";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { resolveRaceLostAdvanceResult, type RoundAdvanceResult } from "@/games/core";
import { generatePersonaReply, deriveFallbackSignal } from "./ai";
import {
  buildWritingDeadline,
  buildRoundPromptText,
  createInitialPendingPersonaReply,
  getActivePlayerIds,
  isComebackRound,
  parseModeState,
  resolvePersonaExamples,
  selectPersonaExamples,
  selectPlayerExamples,
} from "./game-logic-core";
import { ensurePersonaPostMortem } from "./persona-post-mortem";
import type {
  MatchSlopOutcome,
  MatchSlopTranscriptEntry,
  MatchSlopTranscriptOutcome,
} from "./types";
import { MATCHSLOP_MOOD_THRESHOLD_UNMATCH, clampMatchSlopMood } from "./types";
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

type AdvanceClaim = {
  currentRound: number;
  totalRounds: number;
  timersDisabled: boolean;
  personaModelId: string;
  modeState: ReturnType<typeof parseModeState>;
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

async function createTurnRound(
  gameId: string,
  roundNumber: number,
  options?: { startDeadline?: boolean; promptText?: string; timersDisabled?: boolean },
): Promise<void> {
  let promptText = options?.promptText;
  let timersDisabled = options?.timersDisabled;

  const [activePlayerIds, game] = await Promise.all([
    getActivePlayerIds(gameId),
    // Skip DB read entirely when caller already supplies promptText + timersDisabled
    promptText != null && timersDisabled != null
      ? null
      : prisma.game.findUnique({ where: { id: gameId }, select: { timersDisabled: true, modeState: true } }),
  ]);

  if (promptText == null || timersDisabled == null) {
    if (!game) return;
    timersDisabled ??= game.timersDisabled;
    if (promptText == null) {
      const modeState = parseModeState(game.modeState);
      promptText = buildRoundPromptText(roundNumber, modeState.profile, modeState.transcript);
    }
  }

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
      phaseDeadline:
        options?.startDeadline === false ? null : buildWritingDeadline(timersDisabled),
      version: { increment: 1 },
    },
  });
}

async function finalizeAdvance(args: {
  gameId: string;
  modeState: ReturnType<typeof parseModeState>;
  outcome: Exclude<MatchSlopOutcome, "IN_PROGRESS">;
  transcript: MatchSlopTranscriptEntry[];
  lastRoundResult: unknown;
  comebackRound: number | null;
}): Promise<RoundAdvanceResult> {
  const { gameId, modeState, outcome, transcript, lastRoundResult, comebackRound } = args;
  return prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: { status: true },
    });
    if (!game || game.status !== "ROUND_RESULTS") {
      return null;
    }

    await tx.game.update({
      where: { id: gameId },
      data: {
        status: "FINAL_RESULTS",
        phaseDeadline: null,
        modeState: toJson({
          ...modeState,
          transcript,
          lastRoundResult: toJson(lastRoundResult),
          outcome,
          comebackRound,
          postMortemGeneration: {
            status: "NOT_REQUESTED",
            updatedAt: new Date().toISOString(),
            generationId: null,
          },
          postMortemDraft: null,
          postMortem: null,
        }),
        version: { increment: 1 },
      },
    });

    return "FINAL_RESULTS";
  });
}

async function transitionAdvanceToNextRound(args: {
  gameId: string;
  nextRound: number;
  promptText: string;
  timersDisabled: boolean;
  modeState: ReturnType<typeof parseModeState>;
  transcript: MatchSlopTranscriptEntry[];
  outcome: MatchSlopOutcome;
  comebackRound: number | null;
}): Promise<RoundAdvanceResult> {
  const {
    gameId,
    nextRound,
    promptText,
    timersDisabled,
    modeState,
    transcript,
    outcome,
    comebackRound,
  } = args;
  const activePlayerIds = await getActivePlayerIds(gameId);

  return prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: { status: true },
    });
    if (!game || game.status !== "ROUND_RESULTS") {
      return null;
    }

    await tx.round.create({
      data: {
        gameId,
        roundNumber: nextRound,
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

    await tx.game.update({
      where: { id: gameId },
      data: {
        currentRound: nextRound,
        status: "WRITING",
        votingPromptIndex: 0,
        phaseDeadline: buildWritingDeadline(timersDisabled),
        modeState: toJson({
          ...modeState,
          transcript,
          lastRoundResult: null,
          outcome,
          comebackRound,
        }),
        version: { increment: 1 },
      },
    });

    return "WRITING";
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
  const hasPreGeneratedProfile =
    modeState.profileGeneration.status === "STREAMING" ||
    modeState.profileGeneration.status === "READY";

  const sampledPersonaExamples =
    modeState.selectedPersonaExampleIds.length > 0
      ? resolvePersonaExamples(modeState.selectedPersonaExampleIds)
      : selectPersonaExamples(modeState.personaIdentity);
  const sampledPlayerExamples =
    modeState.selectedPlayerExamples.length > 0
      ? modeState.selectedPlayerExamples
      : selectPlayerExamples();

  await prisma.game.update({
    where: { id: gameId },
    data: {
      totalRounds: game.totalRounds > 0 ? game.totalRounds : DEFAULT_TOTAL_ROUNDS,
      modeState: toJson({
        ...modeState,
        selectedPersonaExampleIds: sampledPersonaExamples.map((example) => example.id),
        selectedPlayerExamples: sampledPlayerExamples,
        // Preserve profile-related fields if generation started in the lobby
        ...(hasPreGeneratedProfile
          ? {}
          : {
              profileDraft: null,
              profileGeneration: {
                status: "NOT_REQUESTED",
                updatedAt: new Date().toISOString(),
                generationId: null,
              },
              profile: null,
              personaImage: {
                status: "NOT_REQUESTED",
                imageUrl: null,
                updatedAt: new Date().toISOString(),
              },
            }),
        transcript: [],
        lastRoundResult: null,
        comebackRound: null,
        outcome: "IN_PROGRESS",
        pendingPersonaReply: createInitialPendingPersonaReply(),
        latestSignalCategory: null,
        latestSideComment: null,
        latestNextSignal: null,
        latestMoodDelta: null,
      }),
      version: { increment: 1 },
    },
  });

  const refreshedGame = await prisma.game.findUnique({
    where: { id: gameId },
    select: { modeState: true },
  });
  const refreshedModeState = refreshedGame ? parseModeState(refreshedGame.modeState) : modeState;
  const profileReady =
    refreshedModeState.profile != null ||
    refreshedModeState.profileGeneration.status === "READY";

  await createTurnRound(gameId, roundNumber, { startDeadline: profileReady });
}

export async function advanceGame(gameId: string): Promise<RoundAdvanceResult> {
  const gameBeforeLock = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      status: true,
      currentRound: true,
      personaModelId: true,
    },
  });

  if (!gameBeforeLock?.personaModelId || gameBeforeLock.status !== "ROUND_RESULTS") {
    return null;
  }

  const { acquired, result } = await withGameOperationLock(
    gameId,
    "matchslop-round-advance",
    async () => {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: {
          status: true,
          currentRound: true,
          totalRounds: true,
          personaModelId: true,
          timersDisabled: true,
          modeState: true,
        },
      });

      if (!game?.personaModelId || game.status !== "ROUND_RESULTS") {
        return null;
      }

      const claim: AdvanceClaim = {
        currentRound: game.currentRound,
        totalRounds: game.totalRounds,
        timersDisabled: game.timersDisabled,
        personaModelId: game.personaModelId,
        modeState: parseModeState(game.modeState),
      };

      const roundResult = claim.modeState.lastRoundResult;
      const profile = claim.modeState.profile;

      if (!roundResult || !profile) {
        const fallbackOutcome = isComebackRound(claim.modeState, claim.currentRound)
          ? "UNMATCHED"
          : "TURN_LIMIT";
        const finalized = await finalizeAdvance({
          gameId,
          modeState: claim.modeState,
          transcript: claim.modeState.transcript,
          lastRoundResult: null,
          outcome: fallbackOutcome,
          comebackRound: claim.modeState.comebackRound,
        });
        if (finalized === "FINAL_RESULTS") {
          void ensurePersonaPostMortem(gameId);
        }
        return finalized;
      }

      const winnerEntry: MatchSlopTranscriptEntry = {
        id: `players-turn-${claim.currentRound}`,
        speaker: "PLAYERS",
        text: roundResult.winnerText,
        turn: claim.currentRound,
        outcome: null,
        authorName: roundResult.authorName,
        selectedPromptText: claim.currentRound === 1 ? (roundResult.selectedPromptText ?? null) : null,
        selectedPromptId: claim.currentRound === 1 ? (roundResult.selectedPromptId ?? null) : null,
      };
      const transcriptWithWinner = [...claim.modeState.transcript, winnerEntry];
      const forceContinue = claim.currentRound === 1;

      // Use the cached reply from the background generation if available.
      const cached = claim.modeState.pendingPersonaReply;
      let reply: string;
      let outcome: "CONTINUE" | "DATE_SEALED" | "UNMATCHED";
      let moodDelta: number;
      let signalCategory: string | null = null;
      let sideComment: string | null = null;
      let nextSignal: string | null = null;

      if (cached.status === "READY" && cached.reply && cached.outcome != null && cached.moodDelta != null) {
        reply = cached.reply;
        outcome = cached.outcome;
        moodDelta = cached.moodDelta;
        signalCategory = cached.signalCategory ?? null;
        sideComment = cached.sideComment ?? null;
        nextSignal = cached.nextSignal ?? null;
      } else {
        const generated = await generatePersonaReply(
          claim.personaModelId,
          claim.modeState.seekerIdentity,
          claim.modeState.personaIdentity,
          profile,
          transcriptWithWinner,
          { forceContinue, currentMood: claim.modeState.mood },
        );
        reply = generated.reply;
        outcome = generated.outcome;
        moodDelta = generated.moodDelta;
        signalCategory = generated.signalCategory;
        sideComment = generated.sideComment;
        nextSignal = generated.nextSignal;
        await accumulateUsage(gameId, [generated.usage]);
      }

      const newMood = clampMatchSlopMood(claim.modeState.mood + moodDelta);
      const effectiveOutcome =
        !forceContinue && newMood <= MATCHSLOP_MOOD_THRESHOLD_UNMATCH
          ? "UNMATCHED" as const
          : outcome;

      const advancePlan = resolveAdvancePlan({
        currentRound: claim.currentRound,
        totalRounds: claim.totalRounds,
        comebackRound: claim.modeState.comebackRound,
        personaOutcome: effectiveOutcome,
      });
      const personaEntry: MatchSlopTranscriptEntry = {
        id: `persona-turn-${claim.currentRound}`,
        speaker: "PERSONA",
        text: reply,
        turn: claim.currentRound,
        outcome: advancePlan.transcriptOutcome,
        authorName: profile.displayName,
        mood: newMood,
      };
      const nextTranscript = [...transcriptWithWinner, personaEntry];
      const fallbackSignals =
        effectiveOutcome === "UNMATCHED" && advancePlan.kind === "NEXT_ROUND"
          ? { signalCategory: "danger zone", nextSignal: "last chance, make it count" }
          : deriveFallbackSignal(moodDelta, newMood, effectiveOutcome);
      const resolvedSignalCategory = signalCategory ?? fallbackSignals.signalCategory;
      const resolvedNextSignal = nextSignal ?? fallbackSignals.nextSignal;

      const updatedModeState = {
        ...claim.modeState,
        mood: newMood,
        pendingPersonaReply: createInitialPendingPersonaReply(),
        latestMoodDelta: moodDelta,
        latestSignalCategory: resolvedSignalCategory,
        latestSideComment: sideComment,
        latestNextSignal: resolvedNextSignal,
      };

      if (advancePlan.kind === "NEXT_ROUND") {
        return transitionAdvanceToNextRound({
          gameId,
          nextRound: advancePlan.nextRound,
          promptText: personaEntry.text,
          timersDisabled: claim.timersDisabled,
          modeState: updatedModeState,
          transcript: nextTranscript,
          outcome: advancePlan.nextOutcome,
          comebackRound: advancePlan.comebackRound,
        });
      }

      const finalized = await finalizeAdvance({
        gameId,
        modeState: updatedModeState,
        transcript: nextTranscript,
        lastRoundResult: roundResult,
        outcome: advancePlan.nextOutcome,
        comebackRound: advancePlan.comebackRound,
      });
      if (finalized === "FINAL_RESULTS") {
        void ensurePersonaPostMortem(gameId);
      }
      return finalized;
    },
  );

  if (!acquired) {
    return resolveRaceLostAdvanceResult(gameId, gameBeforeLock.currentRound);
  }
  return result ?? null;
}
