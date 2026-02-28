import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import type { PhaseAdvanceResult } from "@/games/core";
import { LEADERBOARD_TAG } from "@/games/core/constants";
import { checkAndDisconnectInactivePlayers } from "@/games/core/disconnect";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import { revalidateTag } from "next/cache";
import { isDeadlineExpired } from "../../route-helpers";
import type { ControllerMetaPayload } from "../controller-data";
import { findControllerMeta, findControllerPayload } from "../controller-data";
import { sseEvent, SSE_HEADERS, SSE_POLL_INTERVAL_MS, SSE_KEEPALIVE_INTERVAL_MS, HEARTBEAT_MIN_INTERVAL_MS } from "../../sse-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId");

  const encoder = new TextEncoder();
  let lastVersion = -1;
  let lastKeepaliveAt = Date.now();
  let lastHeartbeatAt = 0;

  const stream = new ReadableStream({
    async start(controller) {
      function enqueue(text: string) {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // stream closed
        }
      }

      function sendKeepalive() {
        const now = Date.now();
        if (now - lastKeepaliveAt >= SSE_KEEPALIVE_INTERVAL_MS) {
          enqueue(": ping\n\n");
          lastKeepaliveAt = now;
        }
      }

      async function touchHeartbeat(meta: ControllerMetaPayload) {
        if (!playerId || meta.status === "FINAL_RESULTS") return;
        const now = Date.now();
        if (now - lastHeartbeatAt < HEARTBEAT_MIN_INTERVAL_MS) return;
        lastHeartbeatAt = now;

        const cutoff = new Date(now - HEARTBEAT_MIN_INTERVAL_MS);
        await prisma.player.updateMany({
          where: { id: playerId, gameId: meta.id, lastSeen: { lt: cutoff } },
          data: { lastSeen: new Date() },
        });

        const def = getGameDefinition(meta.gameType);
        const hostControlStale =
          !!meta.hostControlLastSeen &&
          now - meta.hostControlLastSeen.getTime() > def.constants.hostStaleMs;

        if (!meta.hostPlayerId && hostControlStale) {
          await def.handlers.promoteHost(meta.id);
        } else if (meta.hostPlayerId && playerId !== meta.hostPlayerId) {
          const host = await prisma.player.findUnique({
            where: { id: meta.hostPlayerId },
            select: { gameId: true, lastSeen: true },
          });
          if (host?.gameId === meta.id && now - host.lastSeen.getTime() > def.constants.hostStaleMs) {
            await def.handlers.promoteHost(meta.id);
          }
        }

        if (meta.status === "WRITING" || meta.status === "VOTING") {
          await checkAndDisconnectInactivePlayers(meta.id, meta.gameType, roomCode);
        }
      }

      try {
        while (!request.signal.aborted) {
          try {
            const meta = await findControllerMeta(roomCode);
            if (!meta) {
              enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
              break;
            }

            const def = getGameDefinition(meta.gameType);

            // Deadline enforcement
            let advancedTo: PhaseAdvanceResult = null;
            if (isDeadlineExpired(meta.phaseDeadline)) {
              advancedTo = await def.handlers.checkAndEnforceDeadline(meta.id);
              if (advancedTo === "VOTING") {
                void def.handlers.generateAiVotes(meta.id);
              } else if (advancedTo === "WRITING") {
                void def.handlers.generateAiResponses(meta.id);
              } else if (advancedTo === "FINAL_RESULTS" && def.capabilities.retainsCompletedData) {
                void applyCompletedGameToLeaderboardAggregate(meta.id).then(() =>
                  revalidateTag(LEADERBOARD_TAG, { expire: 0 }),
                );
              }
            }

            const effectiveVersion = advancedTo ? -1 : meta.version;
            if (effectiveVersion !== lastVersion) {
              const payload = await findControllerPayload(roomCode, playerId);
              if (!payload) {
                enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
                break;
              }

              enqueue(sseEvent("state", payload));
              lastVersion = payload.version;
              lastKeepaliveAt = Date.now();

              if (payload.status === "FINAL_RESULTS") {
                enqueue(sseEvent("done", {}));
                break;
              }
            } else {
              sendKeepalive();
            }

            await touchHeartbeat(meta);

          } catch {
            if (request.signal.aborted) break;
            enqueue(sseEvent("server-error", { code: "INTERNAL", message: "Stream error" }));
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }

          await new Promise((resolve) => {
            const timer = setTimeout(resolve, SSE_POLL_INTERVAL_MS);
            request.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              resolve(undefined);
            }, { once: true });
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
