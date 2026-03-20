import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { runAiResponsesGeneration } from "@/games/core/runtime";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { generatePersonaProfile, streamPersonaProfile } from "./ai";
import {
  buildRoundPromptText,
  buildWritingDeadline,
  parseModeState,
  resolvePersonaExamples,
  selectPersonaExamples,
} from "./game-logic-core";
import { ensurePersonaImage } from "./persona-image";
import type { MatchSlopProfile, MatchSlopProfileDraft } from "./types";

type InflightPersonaProfile = {
  token: symbol;
  promise: Promise<void>;
};

const inflightPersonaProfiles = new Map<string, InflightPersonaProfile>();
const PROFILE_DRAFT_PUBLISH_INTERVAL_MS = 250;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newGenerationId(): string {
  return crypto.randomUUID();
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

    const generationId = newGenerationId();
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
            generationId,
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
        generationId,
        personaModelId: game.personaModelId,
        seekerIdentity: modeState.seekerIdentity,
        personaIdentity: modeState.personaIdentity,
        personaExamples: resolvePersonaExamples(modeState.selectedPersonaExampleIds),
      };
    }
  }

  return null;
}

async function publishProfileDraft(
  gameId: string,
  generationId: string,
  profileDraft: MatchSlopProfileDraft,
): Promise<boolean> {
  return updateModeState(gameId, (modeState) => {
    if (modeState.profile) return null;
    if (modeState.profileGeneration.status !== "STREAMING") return null;
    if (modeState.profileGeneration.generationId !== generationId) return null;

    return {
      ...modeState,
      profileDraft,
      profileGeneration: {
        status: "STREAMING",
        updatedAt: nowIso(),
        generationId,
      },
    };
  });
}

async function finalizePersonaProfile(
  gameId: string,
  generationId: string,
  profile: MatchSlopProfile,
): Promise<boolean> {
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
    if (modeState.profileGeneration.generationId !== generationId) return false;

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
              generationId,
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

    const results = await prisma.$transaction([
      ...updates,
    ] as [Prisma.PrismaPromise<unknown>, ...Prisma.PrismaPromise<unknown>[]]);

    // The game updateMany is always the last element (prompt update is optional first)
    const gameUpdate = results[results.length - 1];
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

async function markPersonaProfileFailed(
  gameId: string,
  generationId: string,
): Promise<void> {
  const updated = await updateModeState(gameId, (modeState) => {
    if (modeState.profile) return null;
    if (
      modeState.profileGeneration.status !== "STREAMING" &&
      modeState.profileGeneration.status !== "NOT_REQUESTED"
    ) {
      return null;
    }
    if (
      modeState.profileGeneration.generationId != null &&
      modeState.profileGeneration.generationId !== generationId
    ) {
      return null;
    }

    return {
      ...modeState,
      profileGeneration: {
        status: "FAILED",
        updatedAt: nowIso(),
        generationId,
      },
    };
  });

  if (updated) {
    await publishGameStateEvent(gameId).catch(() => undefined);
  }
}

async function isCurrentPersonaGeneration(
  gameId: string,
  generationId: string,
): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { modeState: true },
  });
  if (!game) return false;

  const modeState = parseModeState(game.modeState);
  return (
    modeState.profile == null &&
    modeState.profileGeneration.status === "STREAMING" &&
    modeState.profileGeneration.generationId === generationId
  );
}

export async function runPostProfileTasks(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { gameType: true },
  });
  if (!game) return;

  const results = await Promise.allSettled([
    (async () => {
      const ran = await runAiResponsesGeneration(gameId, game.gameType);
      if (ran) {
        await publishGameStateEvent(gameId);
      }
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
  if (existing) return existing.promise;

  const token = Symbol(gameId);
  const promise = doEnsurePersonaProfile(gameId).finally(() => {
    const current = inflightPersonaProfiles.get(gameId);
    if (current?.token === token) {
      inflightPersonaProfiles.delete(gameId);
    }
  });
  inflightPersonaProfiles.set(gameId, { token, promise });
  return promise;
}

async function doEnsurePersonaProfile(gameId: string): Promise<void> {
  const claim = await claimPersonaProfileGeneration(gameId);
  if (!claim) return;

  const { generationId } = claim;
  await publishGameStateEvent(gameId).catch(() => undefined);

  let latestDraft: MatchSlopProfileDraft | null = null;
  let lastPersistedDraftJson = "";
  let lastDraftPublishAt = 0;

  const flushDraft = async (force = false) => {
    if (!latestDraft) return;
    if (!force && Date.now() - lastDraftPublishAt < PROFILE_DRAFT_PUBLISH_INTERVAL_MS) return;
    const nextJson = JSON.stringify(latestDraft);
    if (nextJson === lastPersistedDraftJson) return;

    // Set timestamp optimistically to prevent concurrent flushes from racing
    lastDraftPublishAt = Date.now();

    const updated = await publishProfileDraft(gameId, generationId, latestDraft);
    if (!updated) return;

    lastPersistedDraftJson = nextJson;
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

    if (!(await isCurrentPersonaGeneration(gameId, generationId))) {
      return;
    }

    await accumulateUsage(gameId, [profileResult.usage]);

    const finalized = await finalizePersonaProfile(gameId, generationId, profileResult.profile);
    if (!finalized) return;

    await publishGameStateEvent(gameId).catch(() => undefined);
    await runPostProfileTasks(gameId);
  } catch (error) {
    console.error(`[matchslop:ensurePersonaProfile] ${gameId} failed:`, error);
    await markPersonaProfileFailed(gameId, generationId);
  }
}

/**
 * Prepare persona examples in modeState so lobby generation can start safely.
 */
async function prepareLobbyPersonaGeneration(
  gameId: string,
  options: { forceReset: boolean; reseedExamples: boolean },
): Promise<boolean> {
  const { forceReset, reseedExamples } = options;

  for (let attempt = 0; attempt < 3; attempt++) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        personaModelId: true,
        modeState: true,
        version: true,
      },
    });
    if (!game?.personaModelId) return false;

    const modeState = parseModeState(game.modeState);
    if (!forceReset && modeState.profile) return true;
    if (
      !forceReset &&
      (modeState.profileGeneration.status === "STREAMING" ||
        modeState.profileGeneration.status === "READY")
    ) {
      return true;
    }

    const shouldReset = forceReset || modeState.profileGeneration.status === "FAILED";
    const nextExampleIds =
      reseedExamples || modeState.selectedPersonaExampleIds.length === 0
        ? selectPersonaExamples(modeState.personaIdentity).map((example) => example.id)
        : modeState.selectedPersonaExampleIds;

    const examplesChanged =
      nextExampleIds.length !== modeState.selectedPersonaExampleIds.length ||
      nextExampleIds.some((id, index) => id !== modeState.selectedPersonaExampleIds[index]);

    if (!shouldReset && !examplesChanged) {
      return true;
    }

    const updated = await prisma.game.updateMany({
      where: { id: gameId, version: game.version },
      data: {
        modeState: toJson({
          ...modeState,
          selectedPersonaExampleIds: nextExampleIds,
          ...(shouldReset
            ? {
                profile: null,
                profileDraft: null,
                profileGeneration: {
                  status: "NOT_REQUESTED",
                  updatedAt: nowIso(),
                  generationId: null,
                },
                personaImage: {
                  status: "NOT_REQUESTED",
                  imageUrl: null,
                  updatedAt: nowIso(),
                },
              }
            : {}),
        }),
        version: { increment: 1 },
      },
    });

    if (updated.count > 0) {
      await publishGameStateEvent(gameId).catch(() => undefined);
      return true;
    }
  }

  return false;
}

export async function startLobbyPersonaGeneration(gameId: string): Promise<boolean> {
  return prepareLobbyPersonaGeneration(gameId, {
    forceReset: false,
    reseedExamples: false,
  });
}

/**
 * Reset the current persona profile so the lobby can start a fresh generation.
 */
export async function skipPersonaProfile(gameId: string): Promise<boolean> {
  inflightPersonaProfiles.delete(gameId);
  return prepareLobbyPersonaGeneration(gameId, {
    forceReset: true,
    reseedExamples: true,
  });
}
