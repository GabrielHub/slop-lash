import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { generatePersonaPostMortem, streamPersonaPostMortem } from "./ai";
import { parseModeState } from "./game-logic-core";
import type { MatchSlopPostMortem, MatchSlopPostMortemDraft } from "./types";

const inflightPostMortems = new Map<string, Promise<void>>();
const POST_MORTEM_DRAFT_PUBLISH_INTERVAL_MS = 250;

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

async function claimPostMortemGeneration(gameId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        version: true,
        status: true,
        personaModelId: true,
        modeState: true,
      },
    });
    if (!game?.personaModelId) return null;
    if (game.status !== "FINAL_RESULTS") return null;

    const modeState = parseModeState(game.modeState);
    if (modeState.postMortem) return null;
    if (modeState.postMortemGeneration.status !== "NOT_REQUESTED") return null;
    if (!modeState.profile) return null;

    const generationId = newGenerationId();
    const claimed = await prisma.game.updateMany({
      where: {
        id: gameId,
        version: game.version,
      },
      data: {
        modeState: toJson({
          ...modeState,
          postMortemDraft: null,
          postMortemGeneration: {
            status: "STREAMING",
            updatedAt: nowIso(),
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
        modeState,
      };
    }
  }

  return null;
}

async function publishPostMortemDraft(
  gameId: string,
  generationId: string,
  postMortemDraft: MatchSlopPostMortemDraft,
): Promise<boolean> {
  return updateModeState(gameId, (modeState) => {
    if (modeState.postMortem) return null;
    if (modeState.postMortemGeneration.status !== "STREAMING") return null;
    if (modeState.postMortemGeneration.generationId !== generationId) return null;

    return {
      ...modeState,
      postMortemDraft,
      postMortemGeneration: {
        status: "STREAMING",
        updatedAt: nowIso(),
        generationId,
      },
    };
  });
}

async function finalizePostMortem(
  gameId: string,
  generationId: string,
  postMortem: MatchSlopPostMortem,
): Promise<boolean> {
  return updateModeState(gameId, (modeState) => {
    if (modeState.postMortem) return null;
    if (modeState.postMortemGeneration.status !== "STREAMING") return null;
    if (modeState.postMortemGeneration.generationId !== generationId) return null;

    return {
      ...modeState,
      postMortemDraft: null,
      postMortemGeneration: {
        status: "READY",
        updatedAt: nowIso(),
        generationId,
      },
      postMortem,
    };
  });
}

async function markPostMortemFailed(
  gameId: string,
  generationId: string,
): Promise<void> {
  const updated = await updateModeState(gameId, (modeState) => {
    if (modeState.postMortem) return null;
    if (
      modeState.postMortemGeneration.status !== "STREAMING" &&
      modeState.postMortemGeneration.status !== "NOT_REQUESTED"
    ) {
      return null;
    }
    if (
      modeState.postMortemGeneration.generationId != null &&
      modeState.postMortemGeneration.generationId !== generationId
    ) {
      return null;
    }

    return {
      ...modeState,
      postMortemGeneration: {
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

export async function ensurePersonaPostMortem(gameId: string): Promise<void> {
  const existing = inflightPostMortems.get(gameId);
  if (existing) return existing;

  const promise = doEnsurePersonaPostMortem(gameId).finally(() => {
    inflightPostMortems.delete(gameId);
  });
  inflightPostMortems.set(gameId, promise);
  return promise;
}

async function doEnsurePersonaPostMortem(gameId: string): Promise<void> {
  const claim = await claimPostMortemGeneration(gameId);
  if (!claim) return;

  const { generationId, modeState } = claim;
  await publishGameStateEvent(gameId).catch(() => undefined);

  // Get player names
  const players = await prisma.player.findMany({
    where: {
      gameId,
      type: { not: "SPECTATOR" },
      participationStatus: "ACTIVE",
    },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const playerNames = players.map((p) => p.name);

  if (!modeState.profile || playerNames.length === 0) {
    await markPostMortemFailed(gameId, generationId);
    return;
  }

  let latestDraft: MatchSlopPostMortemDraft | null = null;
  let lastPersistedDraftJson = "";
  let lastDraftPublishAt = 0;

  const flushDraft = async (force = false) => {
    if (!latestDraft) return;
    if (!force && Date.now() - lastDraftPublishAt < POST_MORTEM_DRAFT_PUBLISH_INTERVAL_MS) return;
    const nextJson = JSON.stringify(latestDraft);
    if (nextJson === lastPersistedDraftJson) return;

    // Set timestamp optimistically to prevent concurrent flushes from racing
    lastDraftPublishAt = Date.now();

    const updated = await publishPostMortemDraft(gameId, generationId, latestDraft);
    if (!updated) return;

    lastPersistedDraftJson = nextJson;
    await publishGameStateEvent(gameId).catch(() => undefined);
  };

  try {
    let postMortemResult;

    try {
      postMortemResult = await streamPersonaPostMortem(
        {
          modelId: claim.personaModelId,
          personaIdentity: modeState.personaIdentity,
          profile: modeState.profile,
          transcript: modeState.transcript,
          playerNames,
          outcome: modeState.outcome,
        },
        {
          onPartialPostMortem: async (draft) => {
            latestDraft = draft;
            await flushDraft();
          },
        },
      );
      await flushDraft(true);
    } catch (streamError) {
      console.error(`[matchslop:ensurePersonaPostMortem] streaming failed for ${gameId}:`, streamError);
      postMortemResult = await generatePersonaPostMortem({
        modelId: claim.personaModelId,
        personaIdentity: modeState.personaIdentity,
        profile: modeState.profile,
        transcript: modeState.transcript,
        playerNames,
        outcome: modeState.outcome,
      });
    }

    await accumulateUsage(gameId, [postMortemResult.usage]);

    const finalized = await finalizePostMortem(gameId, generationId, postMortemResult.postMortem);
    if (!finalized) return;

    await publishGameStateEvent(gameId).catch(() => undefined);
  } catch (error) {
    console.error(`[matchslop:ensurePersonaPostMortem] ${gameId} failed:`, error);
    await markPostMortemFailed(gameId, generationId);
  }
}
