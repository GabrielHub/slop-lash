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

/** Known bot user-agent patterns */
const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegrambot|discordbot|applebot|yandex|baidu|duckduckbot|sogou|exabot|ia_archiver|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider/i;

function isBot(request: NextRequest): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  return BOT_UA_PATTERN.test(ua);
}

function getRouteKey(pathname: string): string | null {
  // Match /api/games/create or /api/games/XXXX/<action>
  const createMatch = pathname.match(/^\/api\/games\/create$/);
  if (createMatch) return "create";

  const actionMatch = pathname.match(/^\/api\/games\/[^/]+\/([a-z-]+)$/);
  return actionMatch?.[1] ?? null;
}

/** Minimal HTML returned to bots instead of full SSR */
const BOT_HTML = `<!DOCTYPE html><html><head><meta name="robots" content="noindex"></head><body></body></html>`;

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Block bots from SSR-heavy game routes and API GET requests
  if (request.method === "GET" && isBot(request)) {
    const isGameRoute =
      pathname.startsWith("/game/") || pathname.startsWith("/controller/") || pathname.startsWith("/stage/");
    const isApiRoute = pathname.startsWith("/api/");

    if (isGameRoute) {
      return new NextResponse(BOT_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html", "X-Robots-Tag": "noindex" },
      });
    }

    if (isApiRoute) {
      return NextResponse.json(
        {},
        { status: 200, headers: { "X-Robots-Tag": "noindex" } },
      );
    }
  }

  // Rate-limit POST requests to API routes
  if (request.method === "POST" && pathname.startsWith("/api/games/")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const routeKey = getRouteKey(pathname);
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
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/games/:path*", "/game/:path*", "/controller/:path*", "/stage/:path*"],
};
