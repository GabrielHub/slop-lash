import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { parseJsonBody } from "@/lib/http";
import { isAuthorizedHostControl, readHostAuth } from "@/lib/host-control-auth";
import {
  ensurePersonaProfile,
  startLobbyPersonaGeneration,
  skipPersonaProfile,
} from "@/games/matchslop/persona-profile";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await parseJsonBody<{
    action?: unknown;
    playerId?: unknown;
    hostToken?: unknown;
  }>(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : null;
  if (action !== "generate" && action !== "skip") {
    return NextResponse.json(
      { error: "action must be 'generate' or 'skip'" },
      { status: 400 },
    );
  }

  const auth = readHostAuth(body);
  if (!auth.playerId && !auth.hostToken) {
    return NextResponse.json(
      { error: "playerId or hostToken is required" },
      { status: 400 },
    );
  }

  const game = await prisma.game.findUnique({
    where: { roomCode: code.toUpperCase() },
    select: {
      id: true,
      gameType: true,
      status: true,
      hostPlayerId: true,
      hostControlTokenHash: true,
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.gameType !== "MATCHSLOP") {
    return NextResponse.json(
      { error: "Persona generation is only available for MatchSlop" },
      { status: 400 },
    );
  }

  if (game.status !== "LOBBY") {
    return NextResponse.json(
      { error: "Persona can only be managed from the lobby" },
      { status: 400 },
    );
  }

  if (!(await isAuthorizedHostControl(game, auth))) {
    return NextResponse.json(
      { error: "Only the host can manage the persona" },
      { status: 403 },
    );
  }

  const accepted =
    action === "generate"
      ? await startLobbyPersonaGeneration(game.id)
      : await skipPersonaProfile(game.id);

  if (!accepted) {
    return NextResponse.json(
      { error: "Persona state changed. Try again." },
      { status: 409 },
    );
  }

  after(async () => {
    await ensurePersonaProfile(game.id);
  });

  return NextResponse.json({ success: true });
}
