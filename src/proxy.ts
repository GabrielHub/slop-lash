import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

/** Route-specific rate limit configs: [limit, windowMs] */
const ROUTE_LIMITS: Record<string, [number, number]> = {
  create: [5, 60_000],
  join: [10, 60_000],
  rejoin: [10, 60_000],
};

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW = 10_000;

function getRouteKey(pathname: string): string | null {
  // Match /api/games/create or /api/games/XXXX/<action>
  const createMatch = pathname.match(/^\/api\/games\/create$/);
  if (createMatch) return "create";

  const actionMatch = pathname.match(/^\/api\/games\/[^/]+\/([a-z-]+)$/);
  return actionMatch?.[1] ?? null;
}

export function proxy(request: NextRequest): NextResponse {
  if (request.method !== "POST") return NextResponse.next();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const routeKey = getRouteKey(request.nextUrl.pathname);
  const config = routeKey ? ROUTE_LIMITS[routeKey] : undefined;
  const limit = config?.[0] ?? DEFAULT_LIMIT;
  const windowMs = config?.[1] ?? DEFAULT_WINDOW;

  const key = routeKey ? `${ip}:${routeKey}` : ip;

  if (!checkRateLimit(key, limit, windowMs)) {
    const retryAfter = Math.ceil(windowMs / 1000);
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/games/:path*",
};
