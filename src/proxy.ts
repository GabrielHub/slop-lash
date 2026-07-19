import { NextResponse, type NextRequest } from "next/server";
import { buildRoomInvitePath, isRoomInviteCode } from "@/lib/room-invite";

/** Known bot user-agent patterns */
const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegrambot|discordbot|applebot|yandex|baidu|duckduckbot|sogou|exabot|ia_archiver|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider/i;

function isBot(request: NextRequest): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  return BOT_UA_PATTERN.test(ua);
}

function getBotRoomInvitePath(pathname: string): string | null {
  const match = /^\/(?:game|controller|stage)\/([^/]+)\/?$/u.exec(pathname);
  const roomCode = match?.[1];
  return roomCode && isRoomInviteCode(roomCode) ? buildRoomInvitePath(roomCode) : null;
}

/** Minimal HTML returned to bots instead of full SSR */
const BOT_HTML = `<!DOCTYPE html><html><head><meta name="robots" content="noindex"></head><body></body></html>`;

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Block bots from SSR-heavy live room routes.
  if (request.method === "GET" && isBot(request)) {
    const invitePath = getBotRoomInvitePath(pathname);
    if (invitePath) {
      return NextResponse.rewrite(new URL(invitePath, request.url), {
        headers: { "X-Robots-Tag": "noindex, nofollow" },
      });
    }

    const isGameRoute =
      pathname.startsWith("/game/") ||
      pathname.startsWith("/controller/") ||
      pathname.startsWith("/stage/");

    if (isGameRoute) {
      return new NextResponse(BOT_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html", "X-Robots-Tag": "noindex" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/game/:path*", "/controller/:path*", "/stage/:path*"],
};
