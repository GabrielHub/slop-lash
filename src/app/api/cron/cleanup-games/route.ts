import { NextResponse } from "next/server";
import { cleanupOldGames } from "@/lib/game-cleanup";
import { isPrismaDataTransferQuotaError } from "@/lib/prisma-errors";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true;

  // Vercel cron requests include this header. Allow it when no explicit secret is set.
  if (!secret && request.headers.has("x-vercel-cron")) return true;
  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await cleanupOldGames();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    if (isPrismaDataTransferQuotaError(error)) {
      return NextResponse.json(
        { ok: false, error: "Neon data transfer quota exceeded during cleanup" },
        { status: 503 },
      );
    }
    throw error;
  }
}

