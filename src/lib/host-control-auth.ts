import { prisma } from "@/lib/db";
import { matchesHostControlToken, parseHostToken } from "@/lib/host-control";

type HostAuthGame = {
  id: string;
  hostPlayerId: string | null;
  hostControlTokenHash?: string | null;
};

export function readHostAuth(body: { playerId?: unknown; hostToken?: unknown }) {
  const playerId = typeof body.playerId === "string" ? body.playerId : null;
  const hostToken = parseHostToken(body.hostToken);
  return { playerId, hostToken };
}

export async function isAuthorizedHostControl(
  game: HostAuthGame,
  auth: { playerId: string | null; hostToken: string | null },
): Promise<boolean> {
  const byPlayer = !!auth.playerId && auth.playerId === game.hostPlayerId;
  const byToken = matchesHostControlToken(game.hostControlTokenHash ?? null, auth.hostToken);

  if (byToken) {
    await prisma.game.update({
      where: { id: game.id },
      data: { hostControlLastSeen: new Date() },
    });
  }

  return byPlayer || byToken;
}
