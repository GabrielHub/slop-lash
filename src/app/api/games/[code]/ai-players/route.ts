import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { parseJsonBody } from "@/lib/http";
import { isAuthorizedHostControl, readHostAuth } from "@/lib/host-control-auth";
import { logGameEvent } from "@/games/core/observability";
import { publishGameStateEvent } from "@/lib/realtime-events";
import { getModelByModelId, selectUniqueModelsByProvider } from "@/lib/models";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const body = await parseJsonBody<{
    playerId?: unknown;
    hostToken?: unknown;
    action?: unknown;
    modelId?: unknown;
    targetPlayerId?: unknown;
  }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const auth = readHostAuth(body);
  const action = typeof body.action === "string" ? body.action : null;

  if (!auth.playerId && !auth.hostToken) {
    return NextResponse.json(
      { error: "playerId or hostToken required" },
      { status: 400 },
    );
  }

  if (action !== "add" && action !== "remove") {
    return NextResponse.json(
      { error: 'action must be "add" or "remove"' },
      { status: 400 },
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode },
    select: {
      id: true,
      gameType: true,
      status: true,
      hostPlayerId: true,
      hostControlTokenHash: true,
      players: {
        select: { id: true, type: true, modelId: true },
      },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "LOBBY") {
    return NextResponse.json(
      { error: "Can only manage AI players during lobby" },
      { status: 400 },
    );
  }

  if (!(await isAuthorizedHostControl(game, auth))) {
    return NextResponse.json(
      { error: "Only the host can manage AI players" },
      { status: 403 },
    );
  }

  const def = getGameDefinition(game.gameType);

  if (action === "add") {
    const modelId = typeof body.modelId === "string" ? body.modelId : null;
    if (!modelId) {
      return NextResponse.json(
        { error: "modelId is required for add" },
        { status: 400 },
      );
    }

    const model = getModelByModelId(modelId);
    if (!model) {
      return NextResponse.json(
        { error: "Unknown model" },
        { status: 400 },
      );
    }

    const activePlayers = game.players.filter((p) => p.type !== "SPECTATOR");
    const existingProviderPlayer = activePlayers.find(
      (p) =>
        p.type === "AI" &&
        p.modelId &&
        getModelByModelId(p.modelId)?.provider === model.provider,
    );

    if (activePlayers.length >= def.constants.maxPlayers && !existingProviderPlayer) {
      return NextResponse.json(
        { error: "Game is full" },
        { status: 400 },
      );
    }

    // Enforce provider uniqueness among AI players
    const existingAiModelIds = activePlayers
      .filter((p) => p.type === "AI" && p.modelId)
      .map((p) => p.modelId!);
    const wouldBeUnique =
      selectUniqueModelsByProvider([...existingAiModelIds, modelId]).length >
      existingAiModelIds.length;

    if (!wouldBeUnique) {
      // Provider already represented — replace the existing one
      if (existingProviderPlayer) {
        await prisma.player.delete({ where: { id: existingProviderPlayer.id } });
      }
    }

    await prisma.player.create({
      data: {
        gameId: game.id,
        name: model.shortName,
        type: "AI",
        modelId: model.id,
      },
    });

    await prisma.game.update({
      where: { id: game.id },
      data: { version: { increment: 1 } },
    });

    logGameEvent(
      "ai-player-added",
      { gameType: game.gameType, gameId: game.id, roomCode },
      { modelId },
    );
    await publishGameStateEvent(game.id);
    return NextResponse.json({ success: true });
  }

  // action === "remove"
  const targetPlayerId =
    typeof body.targetPlayerId === "string" ? body.targetPlayerId : null;
  if (!targetPlayerId) {
    return NextResponse.json(
      { error: "targetPlayerId is required for remove" },
      { status: 400 },
    );
  }

  const target = game.players.find((p) => p.id === targetPlayerId);
  if (!target) {
    return NextResponse.json(
      { error: "Player not in this game" },
      { status: 404 },
    );
  }

  if (target.type !== "AI") {
    return NextResponse.json(
      { error: "Can only remove AI players with this endpoint" },
      { status: 400 },
    );
  }

  await prisma.player.delete({ where: { id: targetPlayerId } });
  await prisma.game.update({
    where: { id: game.id },
    data: { version: { increment: 1 } },
  });

  logGameEvent(
    "ai-player-removed",
    { gameType: game.gameType, gameId: game.id, roomCode },
    { targetPlayerId, modelId: target.modelId },
  );
  await publishGameStateEvent(game.id);
  return NextResponse.json({ success: true });
}
