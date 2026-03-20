import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";
import { generatePersonaImage, generatePersonaPortraitPrompt } from "./ai";
import { parseModeState } from "./game-logic-core";

const inflightPersonaImages = new Map<string, Promise<void>>();

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function buildImageStateUpdate(imageUrl: string | null) {
  return {
    status: imageUrl ? "READY" : "FAILED",
    imageUrl,
    updatedAt: new Date().toISOString(),
  } as const;
}

async function updatePersonaImageState(
  gameId: string,
  resolveNextState: (current: ReturnType<typeof parseModeState>["personaImage"]) => {
    status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
    imageUrl: string | null;
    updatedAt: string;
  } | null,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const latestGame = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        version: true,
        modeState: true,
      },
    });
    if (!latestGame) return false;

    const latestModeState = parseModeState(latestGame.modeState);
    const nextPersonaImage = resolveNextState(latestModeState.personaImage);
    if (!nextPersonaImage) return false;

    const updated = await prisma.game.updateMany({
      where: {
        id: gameId,
        version: latestGame.version,
      },
      data: {
        modeState: toJson({
          ...latestModeState,
          personaImage: nextPersonaImage,
        }),
        version: { increment: 1 },
      },
    });

    if (updated.count > 0) {
      return true;
    }
  }

  return false;
}

async function markPersonaImageFailed(gameId: string): Promise<void> {
  const updated = await updatePersonaImageState(gameId, (personaImage) => {
    if (personaImage.status !== "PROCESSING" || personaImage.imageUrl) {
      return null;
    }
    return buildImageStateUpdate(null);
  });

  if (updated) {
    await publishGameStateEvent(gameId);
  }
}

async function claimPersonaImageGeneration(gameId: string) {
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
    const profile = modeState.profile;
    const personaImage = modeState.personaImage;
    if (!profile) return null;
    if (personaImage.status !== "PENDING" || personaImage.imageUrl) return null;

    const claimed = await prisma.game.updateMany({
      where: {
        id: gameId,
        version: game.version,
      },
      data: {
        modeState: toJson({
          ...modeState,
          personaImage: {
            status: "PROCESSING",
            imageUrl: null,
            updatedAt: new Date().toISOString(),
          },
        }),
        version: { increment: 1 },
      },
    });

    if (claimed.count > 0) {
      return {
        personaModelId: game.personaModelId,
        personaIdentity: modeState.personaIdentity,
        profile,
      };
    }
  }

  return null;
}

export async function ensurePersonaImage(gameId: string): Promise<void> {
  const existing = inflightPersonaImages.get(gameId);
  if (existing) return existing;

  const promise = doEnsurePersonaImage(gameId).finally(() => {
    inflightPersonaImages.delete(gameId);
  });
  inflightPersonaImages.set(gameId, promise);
  return promise;
}

async function doEnsurePersonaImage(gameId: string): Promise<void> {
  const claim = await claimPersonaImageGeneration(gameId);
  if (!claim) return;

  await publishGameStateEvent(gameId).catch(() => undefined);

  try {
    const promptResult = await generatePersonaPortraitPrompt(
      claim.personaModelId,
      claim.personaIdentity,
      claim.profile,
    );
    await accumulateUsage(gameId, [promptResult.usage]);

    const imageResult = await generatePersonaImage(promptResult.prompt);

    const updated = await updatePersonaImageState(gameId, (personaImage) => {
      if (personaImage.status !== "PROCESSING" || personaImage.imageUrl) {
        return null;
      }
      return buildImageStateUpdate(imageResult.imageUrl);
    });

    if (updated) {
      await publishGameStateEvent(gameId);
    }
  } catch (error) {
    console.error(`[matchslop:ensurePersonaImage] ${gameId} failed:`, error);
    await markPersonaImageFailed(gameId);
  }
}
