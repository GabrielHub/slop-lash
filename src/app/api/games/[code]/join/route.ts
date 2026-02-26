import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { MAX_PLAYERS } from "@/lib/game-logic";
import { MAX_SPECTATORS } from "@/lib/game-constants";
import { sanitize } from "@/lib/sanitize";
import { parseJsonBody } from "@/lib/http";

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

  // Non-spectators can only join in LOBBY
  if (!isSpectator && game.status !== "LOBBY") {
    return NextResponse.json(
      { error: "Game already in progress" },
      { status: 400 }
    );
  }

  // Quick capacity check before transaction
  if (!isSpectator) {
    const playerCount = game.players.filter((p) => p.type !== "SPECTATOR").length;
    if (playerCount >= MAX_PLAYERS) {
      return NextResponse.json(
        { error: `Game is full (max ${MAX_PLAYERS} players)` },
        { status: 400 }
      );
    }
  } else {
    const spectatorCount = game.players.filter((p) => p.type === "SPECTATOR").length;
    if (spectatorCount >= MAX_SPECTATORS) {
      return NextResponse.json(
        { error: `Spectator slots full (max ${MAX_SPECTATORS})` },
        { status: 400 }
      );
    }
  }

  // Case-insensitive duplicate name check — allow reclaiming stale players
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

    return NextResponse.json({
      playerId: existingPlayer.id,
      gameId: game.id,
      playerType: isSpectator ? "SPECTATOR" : existingPlayer.type,
      rejoinToken: newToken,
    });
  }

  // Use a transaction to prevent race conditions
  let player;
  try {
    player = await prisma.$transaction(async (tx) => {
      if (isSpectator) {
        const spectatorCount = await tx.player.count({
          where: { gameId: game.id, type: "SPECTATOR" },
        });
        if (spectatorCount >= MAX_SPECTATORS) throw new Error("SPEC_FULL");
      } else {
        const playerCount = await tx.player.count({
          where: { gameId: game.id, type: { not: "SPECTATOR" } },
        });
        if (playerCount >= MAX_PLAYERS) throw new Error("FULL");
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
      FULL: `Game is full (max ${MAX_PLAYERS} players)`,
      SPEC_FULL: `Spectator slots full (max ${MAX_SPECTATORS})`,
      NAME_TAKEN: "That name is already taken",
    };
    const msg = e instanceof Error ? errorMessages[e.message] : undefined;
    if (msg) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw e;
  }

  // Bump version so pollers pick up the new player
  await prisma.game.update({
    where: { id: game.id },
    data: { version: { increment: 1 } },
  });

  return NextResponse.json({
    playerId: player.id,
    gameId: game.id,
    playerType: player.type,
    rejoinToken: player.rejoinToken,
  });
}
