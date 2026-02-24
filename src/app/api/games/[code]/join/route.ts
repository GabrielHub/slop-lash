import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MAX_PLAYERS } from "@/lib/game-logic";
import { sanitize } from "@/lib/sanitize";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { name } = await request.json();

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const cleanName = sanitize(name, 20);
  if (cleanName.length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    include: { players: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "LOBBY") {
    return NextResponse.json(
      { error: "Game already in progress" },
      { status: 400 }
    );
  }

  if (game.players.length >= MAX_PLAYERS) {
    return NextResponse.json(
      { error: `Game is full (max ${MAX_PLAYERS} players)` },
      { status: 400 }
    );
  }

  // Case-insensitive duplicate name check
  const duplicate = game.players.some(
    (p) => p.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    return NextResponse.json(
      { error: "That name is already taken" },
      { status: 400 }
    );
  }

  // Use a transaction to prevent race conditions (duplicate names / exceeding max players)
  let player;
  try {
    player = await prisma.$transaction(async (tx) => {
      const current = await tx.player.count({ where: { gameId: game.id } });
      if (current >= MAX_PLAYERS) throw new Error("FULL");

      const existing = await tx.player.findFirst({
        where: { gameId: game.id, name: { equals: cleanName, mode: "insensitive" } },
      });
      if (existing) throw new Error("NAME_TAKEN");

      return tx.player.create({
        data: { gameId: game.id, name: cleanName, type: "HUMAN" },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FULL") {
      return NextResponse.json(
        { error: `Game is full (max ${MAX_PLAYERS} players)` },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "NAME_TAKEN") {
      return NextResponse.json(
        { error: "That name is already taken" },
        { status: 400 }
      );
    }
    throw e;
  }

  return NextResponse.json({ playerId: player.id, gameId: game.id });
}
