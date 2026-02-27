import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { sanitize } from "@/lib/sanitize";
import { parseJsonBody } from "@/lib/http";
import { logGameEvent } from "@/games/core/observability";

/** A player is considered stale (reclaimable) after 30 seconds of inactivity. */
const STALE_THRESHOLD_MS = 30_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await parseJsonBody<{ name?: unknown; spectator?: unknown }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { name, spectator } = body;
  const isSpectator = spectator === true;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const cleanName = sanitize(name, 20);
  if (cleanName.length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: {
      id: true,
      gameType: true,
      status: true,
      players: {
        select: {
          id: true,
          name: true,
          type: true,
          lastSeen: true,
        },
      },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const def = getGameDefinition(game.gameType);

  if (isSpectator && !def.capabilities.supportsSpectators) {
    return NextResponse.json(
      { error: "This game mode doesn't support spectators" },
      { status: 400 }
    );
  }

  if (!isSpectator && game.status !== "LOBBY") {
    return NextResponse.json(
      { error: "Game already in progress" },
      { status: 400 }
    );
  }

  if (!isSpectator) {
    const playerCount = game.players.filter((p) => p.type !== "SPECTATOR").length;
    if (playerCount >= def.constants.maxPlayers) {
      return NextResponse.json(
        { error: `Game is full (max ${def.constants.maxPlayers} players)` },
        { status: 400 }
      );
    }
  } else {
    const spectatorCount = game.players.filter((p) => p.type === "SPECTATOR").length;
    if (spectatorCount >= def.constants.maxSpectators) {
      return NextResponse.json(
        { error: `Spectator slots full (max ${def.constants.maxSpectators})` },
        { status: 400 }
      );
    }
  }

  const existingPlayer = game.players.find(
    (p) => p.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (existingPlayer) {
    const isStale = Date.now() - new Date(existingPlayer.lastSeen).getTime() > STALE_THRESHOLD_MS;

    // Non-spectator reclaim only allowed during LOBBY (mirrors the new-join guard)
    const canReclaim = isStale && (existingPlayer.type === "SPECTATOR" || game.status === "LOBBY");

    if (!canReclaim) {
      return NextResponse.json(
        { error: "That name is already taken" },
        { status: 400 }
      );
    }

    // Reclaim the stale player slot — use optimistic lock on lastSeen to prevent
    // concurrent reclaims from hijacking a player that just came back online
    const newToken = randomBytes(12).toString("base64url");
    const claimed = await prisma.player.updateMany({
      where: {
        id: existingPlayer.id,
        lastSeen: existingPlayer.lastSeen, // optimistic lock
      },
      data: {
        rejoinToken: newToken,
        lastSeen: new Date(),
        type: isSpectator ? "SPECTATOR" : existingPlayer.type,
      },
    });

    if (claimed.count === 0) {
      // Another request reclaimed or the original player came back online
      return NextResponse.json(
        { error: "That name is already taken" },
        { status: 400 }
      );
    }

    await prisma.game.update({
      where: { id: game.id },
      data: { version: { increment: 1 } },
    });

    logGameEvent("joined", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
      playerId: existingPlayer.id,
      playerType: isSpectator ? "SPECTATOR" : existingPlayer.type,
      reclaimed: true,
    });

    return NextResponse.json({
      playerId: existingPlayer.id,
      gameId: game.id,
      playerType: isSpectator ? "SPECTATOR" : existingPlayer.type,
      rejoinToken: newToken,
    });
  }

  let player;
  try {
    player = await prisma.$transaction(async (tx) => {
      if (isSpectator) {
        const spectatorCount = await tx.player.count({
          where: { gameId: game.id, type: "SPECTATOR" },
        });
        if (spectatorCount >= def.constants.maxSpectators) throw new Error("SPEC_FULL");
      } else {
        const playerCount = await tx.player.count({
          where: { gameId: game.id, type: { not: "SPECTATOR" } },
        });
        if (playerCount >= def.constants.maxPlayers) throw new Error("FULL");
      }

      const existing = await tx.player.findFirst({
        where: { gameId: game.id, name: { equals: cleanName, mode: "insensitive" } },
      });
      if (existing) throw new Error("NAME_TAKEN");

      const rejoinToken = randomBytes(12).toString("base64url");
      return tx.player.create({
        data: {
          gameId: game.id,
          name: cleanName,
          type: isSpectator ? "SPECTATOR" : "HUMAN",
          rejoinToken,
        },
      });
    });
  } catch (e) {
    const errorMessages: Record<string, string> = {
      FULL: `Game is full (max ${def.constants.maxPlayers} players)`,
      SPEC_FULL: `Spectator slots full (max ${def.constants.maxSpectators})`,
      NAME_TAKEN: "That name is already taken",
    };
    const msg = e instanceof Error ? errorMessages[e.message] : undefined;
    if (msg) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw e;
  }

  await prisma.game.update({
    where: { id: game.id },
    data: { version: { increment: 1 } },
  });

  logGameEvent("joined", { gameType: game.gameType, gameId: game.id, roomCode: code.toUpperCase() }, {
    playerId: player.id,
    playerType: player.type,
    reclaimed: false,
  });

  return NextResponse.json({
    playerId: player.id,
    gameId: game.id,
    playerType: player.type,
    rejoinToken: player.rejoinToken,
  });
}
