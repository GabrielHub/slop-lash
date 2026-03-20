import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { generatePersonaProfile, streamPersonaProfile } from "./ai";
import { generateAiResponses } from "./game-logic-ai";
import {
  buildRoundPromptText,
  buildWritingDeadline,
  parseModeState,
  resolvePersonaExamples,
} from "./game-logic-core";
import { ensurePersonaImage } from "./persona-image";
import type { MatchSlopProfile, MatchSlopProfileDraft } from "./types";

const inflightPersonaProfiles = new Map<string, Promise<void>>();
const PROFILE_DRAFT_PUBLISH_INTERVAL_MS = 250;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function updateModeState(
  gameId: string,
  resolveModeState: (
    modeState: ReturnType<typeof parseModeState>,
    game: { currentRound: number; status: string },
  ) => ReturnType<typeof parseModeState> | null,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        version: true,
        currentRound: true,
        status: true,
        modeState: true,
      },
    });
    if (!game) return false;

    const modeState = parseModeState(game.modeState);
    const nextModeState = resolveModeState(modeState, {
      currentRound: game.currentRound,
      status: game.status,
    });
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

async function claimPersonaProfileGeneration(gameId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        version: true,
        personaModelId: true,
        modeState: true,
      },
    });
    if (!game?.personaModelId) return null;

    const modeState = parseModeState(game.modeState);
    if (modeState.profile) return null;
    if (modeState.profileGeneration.status !== "NOT_REQUESTED") return null;

    const claimed = await prisma.game.updateMany({
      where: {
        id: gameId,
        version: game.version,
      },
      data: {
        modeState: toJson({
          ...modeState,
          profileDraft: null,
          profileGeneration: {
            status: "STREAMING",
            updatedAt: nowIso(),
          },
          personaImage: {
            status: "NOT_REQUESTED",
            imageUrl: null,
            updatedAt: nowIso(),
          },
        }),
        version: { increment: 1 },
      },
    });

    if (claimed.count > 0) {
      return {
        personaModelId: game.personaModelId,
        seekerIdentity: modeState.seekerIdentity,
        personaIdentity: modeState.personaIdentity,
        personaExamples: resolvePersonaExamples(modeState.selectedPersonaExampleIds),
      };
    }
  }

  return null;
}

async function publishProfileDraft(gameId: string, profileDraft: MatchSlopProfileDraft): Promise<boolean> {
  return updateModeState(gameId, (modeState) => {
    if (modeState.profile) return null;
    if (modeState.profileGeneration.status !== "STREAMING") return null;

    return {
      ...modeState,
      profileDraft,
      profileGeneration: {
        status: "STREAMING",
        updatedAt: nowIso(),
      },
    };
  });
}

async function finalizePersonaProfile(gameId: string, profile: MatchSlopProfile): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        version: true,
        currentRound: true,
        status: true,
        timersDisabled: true,
        modeState: true,
        rounds: {
          where: { roundNumber: 1 },
          select: {
            prompts: {
              orderBy: { id: "asc" },
              take: 1,
              select: { id: true, text: true },
            },
          },
        },
      },
    });
    if (!game) return false;

    const modeState = parseModeState(game.modeState);
    if (modeState.profile) return true;
    if (modeState.profileGeneration.status !== "STREAMING") return false;

    const promptText = buildRoundPromptText(1, profile, []);
    const promptId = game.currentRound === 1 ? game.rounds[0]?.prompts[0]?.id : null;

    const updates: Prisma.PrismaPromise<unknown>[] = [];
    if (promptId) {
      updates.push(
        prisma.prompt.update({
          where: { id: promptId },
          data: { text: promptText },
        }),
      );
    }

    updates.push(
      prisma.game.updateMany({
        where: {
          id: gameId,
          version: game.version,
        },
        data: {
          modeState: toJson({
            ...modeState,
            profileDraft: null,
            profileGeneration: {
              status: "READY",
              updatedAt: nowIso(),
            },
            profile,
            personaImage: {
              status: "PENDING",
              imageUrl: null,
              updatedAt: nowIso(),
            },
          }),
          ...(game.status === "WRITING" && game.currentRound === 1
            ? { phaseDeadline: buildWritingDeadline(game.timersDisabled) }
            : {}),
          version: { increment: 1 },
        },
      }),
    );

    const [, gameUpdate] = await prisma.$transaction([
      ...updates,
    ] as [Prisma.PrismaPromise<unknown>, ...Prisma.PrismaPromise<unknown>[]]);

    if (
      typeof gameUpdate === "object" &&
      gameUpdate != null &&
      "count" in gameUpdate &&
      typeof gameUpdate.count === "number" &&
      gameUpdate.count > 0
    ) {
      return true;
    }
  }

  return false;
}

async function markPersonaProfileFailed(gameId: string): Promise<void> {
  const updated = await updateModeState(gameId, (modeState) => {
    if (modeState.profile) return null;
    if (
      modeState.profileGeneration.status !== "STREAMING" &&
      modeState.profileGeneration.status !== "NOT_REQUESTED"
    ) {
      return null;
    }

    return {
      ...modeState,
      profileGeneration: {
        status: "FAILED",
        updatedAt: nowIso(),
      },
    };
  });

  if (updated) {
    await publishGameStateEvent(gameId).catch(() => undefined);
  }
}

async function runPostProfileTasks(gameId: string): Promise<void> {
  const results = await Promise.allSettled([
    (async () => {
      await generateAiResponses(gameId);
      await publishGameStateEvent(gameId);
    })(),
    ensurePersonaImage(gameId),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`[matchslop:ensurePersonaProfile] post-profile task failed for ${gameId}:`, result.reason);
    }
  }
}

export async function ensurePersonaProfile(gameId: string): Promise<void> {
  const existing = inflightPersonaProfiles.get(gameId);
  if (existing) return existing;

  const promise = doEnsurePersonaProfile(gameId).finally(() => {
    inflightPersonaProfiles.delete(gameId);
  });
  inflightPersonaProfiles.set(gameId, promise);
  return promise;
}

async function doEnsurePersonaProfile(gameId: string): Promise<void> {
  const claim = await claimPersonaProfileGeneration(gameId);
  if (!claim) return;

  await publishGameStateEvent(gameId).catch(() => undefined);

  let latestDraft: MatchSlopProfileDraft | null = null;
  let lastPersistedDraftJson = "";
  let lastDraftPublishAt = 0;

  const flushDraft = async (force = false) => {
    if (!latestDraft) return;
    if (!force && Date.now() - lastDraftPublishAt < PROFILE_DRAFT_PUBLISH_INTERVAL_MS) return;
    const nextJson = JSON.stringify(latestDraft);
    if (nextJson === lastPersistedDraftJson) return;

    const updated = await publishProfileDraft(gameId, latestDraft);
    if (!updated) return;

    lastPersistedDraftJson = nextJson;
    lastDraftPublishAt = Date.now();
    await publishGameStateEvent(gameId).catch(() => undefined);
  };

  try {
    let profileResult;

    try {
      profileResult = await streamPersonaProfile(
        claim.personaModelId,
        claim.seekerIdentity,
        claim.personaIdentity,
        claim.personaExamples,
        {
          onPartialProfile: async (profileDraft) => {
            latestDraft = profileDraft;
            await flushDraft();
          },
        },
      );
      await flushDraft(true);
    } catch (streamError) {
      console.error(`[matchslop:ensurePersonaProfile] streaming failed for ${gameId}:`, streamError);
      profileResult = await generatePersonaProfile(
        claim.personaModelId,
        claim.seekerIdentity,
        claim.personaIdentity,
        claim.personaExamples,
      );
    }

    await accumulateUsage(gameId, [profileResult.usage]);

    const finalized = await finalizePersonaProfile(gameId, profileResult.profile);
    if (!finalized) return;

    await publishGameStateEvent(gameId).catch(() => undefined);
    await runPostProfileTasks(gameId);
  } catch (error) {
    console.error(`[matchslop:ensurePersonaProfile] ${gameId} failed:`, error);
    await markPersonaProfileFailed(gameId);
  }
}
