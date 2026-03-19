import { prisma } from "@/lib/db";
import { getGameDefinition } from "@/games/registry";
import { LEADERBOARD_TAG } from "@/games/core/constants";
import { checkAndDisconnectInactivePlayers } from "@/games/core/disconnect";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import { revalidateTag } from "next/cache";
import { matchesHostControlToken } from "@/lib/host-control";
import { publishGameStateEvent, waitForRealtimeEvent } from "@/lib/realtime-events";
import type { GameMetaPayload } from "../route-data";
import { findGameMeta, findGamePayloadByStatus, normalizePayload } from "../route-data";
import { isDeadlineExpired, stripUnrevealedVotes } from "../route-helpers";
import {
  sseEvent,
  SSE_HEADERS,
  SSE_KEEPALIVE_INTERVAL_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
} from "../sse-helpers";

export const dynamic = "force-dynamic";

const SAFETY_CHECK_INTERVAL_MS = 10_000;
const IDLE_WAKE_INTERVAL_MS = 30_000;
const lastSafetyCheck = new Map<string, number>();

function getStateKey(meta: GameMetaPayload): string {
  return `${meta.version}:${meta.reactionsVersion}`;
}

function getDeadlineWaitMs(phaseDeadline: Date | null): number {
  if (!phaseDeadline) return Number.POSITIVE_INFINITY;
  return Math.max(phaseDeadline.getTime() - Date.now(), 0);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId");
  const hostToken = url.searchParams.get("hostToken");

  const encoder = new TextEncoder();
  let lastStateKey = "";
  let lastKeepaliveAt = Date.now();
  let latestMeta: GameMetaPayload | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatBusy = false;

  const stream = new ReadableStream({
    async start(controller) {
      function enqueue(text: string) {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // Stream already closed.
        }
      }

      function sendKeepalive() {
        const now = Date.now();
        if (now - lastKeepaliveAt >= SSE_KEEPALIVE_INTERVAL_MS) {
          enqueue(": ping\n\n");
          lastKeepaliveAt = now;
        }
      }

      async function runWritingSafety(meta: GameMetaPayload): Promise<boolean> {
        if (meta.status !== "WRITING") return false;

        const now = Date.now();
        const lastCheck = lastSafetyCheck.get(meta.id) ?? 0;
        if (now - lastCheck < SAFETY_CHECK_INTERVAL_MS) return false;

        lastSafetyCheck.set(meta.id, now);
        const def = getGameDefinition(meta.gameType);

        try {
          const allIn = await def.handlers.checkAllResponsesIn(meta.id);
          if (!allIn) return false;

          lastSafetyCheck.delete(meta.id);
          const claimed = await def.handlers.startVoting(meta.id);
          if (!claimed) return false;

          await publishGameStateEvent(meta.id);
          if (meta.gameType !== "AI_CHAT_SHOWDOWN") {
            void (async () => {
              await def.handlers.generateAiVotes(meta.id);
              await publishGameStateEvent(meta.id);
            })();
          }
          return true;
        } catch {
          lastSafetyCheck.delete(meta.id);
          return false;
        }
      }

      async function enforceDeadline(meta: GameMetaPayload): Promise<boolean> {
        if (!isDeadlineExpired(meta.phaseDeadline)) return false;

        const def = getGameDefinition(meta.gameType);
        const advancedTo = await def.handlers.checkAndEnforceDeadline(meta.id);
        if (!advancedTo) return false;

        await publishGameStateEvent(meta.id);

        if (advancedTo === "VOTING") {
          void (async () => {
            await def.handlers.generateAiVotes(meta.id);
            await publishGameStateEvent(meta.id);
          })();
        } else if (advancedTo === "WRITING") {
          void (async () => {
            await def.handlers.generateAiResponses(meta.id);
            await publishGameStateEvent(meta.id);
          })();
        } else if (advancedTo === "FINAL_RESULTS" && def.capabilities.retainsCompletedData) {
          void applyCompletedGameToLeaderboardAggregate(meta.id).then(() =>
            revalidateTag(LEADERBOARD_TAG, { expire: 0 }),
          );
        }

        return true;
      }

      async function touchHeartbeat(meta: GameMetaPayload) {
        if (meta.status === "FINAL_RESULTS") return;

        let stateChanged = false;
        const now = Date.now();

        if (playerId) {
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
            stateChanged = true;
          } else if (meta.hostPlayerId && playerId !== meta.hostPlayerId) {
            const host = await prisma.player.findUnique({
              where: { id: meta.hostPlayerId },
              select: { gameId: true, lastSeen: true },
            });
            if (host?.gameId === meta.id && now - host.lastSeen.getTime() > def.constants.hostStaleMs) {
              await def.handlers.promoteHost(meta.id);
              stateChanged = true;
            }
          }

          if (meta.status === "WRITING" || meta.status === "VOTING") {
            const disconnectedIds = await checkAndDisconnectInactivePlayers(meta.id, meta.gameType, roomCode);
            if (disconnectedIds.length > 0) {
              stateChanged = true;
            }
          }
        }

        const isHostTouch =
          !!hostToken && matchesHostControlToken(meta.hostControlTokenHash, hostToken);
        if (isHostTouch) {
          const cutoff = new Date(now - HEARTBEAT_MIN_INTERVAL_MS);
          await prisma.game.updateMany({
            where: { id: meta.id, hostControlLastSeen: { lt: cutoff } },
            data: { hostControlLastSeen: new Date() },
          });
        }

        if (stateChanged) {
          await publishGameStateEvent(meta.id);
        }
      }

      async function syncState(force: boolean): Promise<boolean> {
        let meta = await findGameMeta(roomCode);
        if (!meta) {
          enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
          return false;
        }

        latestMeta = meta;

        const deadlineChanged = await enforceDeadline(meta);
        if (deadlineChanged) {
          meta = await findGameMeta(roomCode);
          if (!meta) {
            enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
            return false;
          }
          latestMeta = meta;
        }

        const safetyChanged = await runWritingSafety(meta);
        if (safetyChanged) {
          meta = await findGameMeta(roomCode);
          if (!meta) {
            enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
            return false;
          }
          latestMeta = meta;
        }

        const nextStateKey = getStateKey(meta);
        if (!force && !deadlineChanged && !safetyChanged && nextStateKey === lastStateKey) {
          return true;
        }

        const game = await findGamePayloadByStatus(roomCode, meta.status);
        if (!game) {
          enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
          return false;
        }

        const normalized = normalizePayload(game);
        if (normalized.status !== "FINAL_RESULTS") {
          stripUnrevealedVotes(normalized);
        }

        enqueue(sseEvent("state", normalized));
        lastStateKey = getStateKey(meta);
        lastKeepaliveAt = Date.now();

        if (normalized.status === "FINAL_RESULTS") {
          enqueue(sseEvent("done", {}));
          return false;
        }

        return true;
      }

      try {
        if (!(await syncState(true))) return;

        heartbeatTimer = setInterval(() => {
          const meta = latestMeta;
          if (!meta || heartbeatBusy || request.signal.aborted) return;

          heartbeatBusy = true;
          void touchHeartbeat(meta).finally(() => {
            heartbeatBusy = false;
          });
        }, HEARTBEAT_MIN_INTERVAL_MS);

        while (!request.signal.aborted) {
          const meta = latestMeta;
          if (!meta) break;

          const timeoutMs = Math.max(
            1,
            Math.min(
              SSE_KEEPALIVE_INTERVAL_MS,
              meta.status === "WRITING" ? SAFETY_CHECK_INTERVAL_MS : IDLE_WAKE_INTERVAL_MS,
              getDeadlineWaitMs(meta.phaseDeadline),
            ),
          );

          const event = await waitForRealtimeEvent(
            { gameId: meta.id, kinds: ["state"] },
            request.signal,
            timeoutMs,
          );
          if (request.signal.aborted) break;

          if (event) {
            if (!(await syncState(true))) break;
            continue;
          }

          sendKeepalive();

          const shouldResync =
            getDeadlineWaitMs(meta.phaseDeadline) <= timeoutMs ||
            (meta.status === "WRITING" && timeoutMs === SAFETY_CHECK_INTERVAL_MS);

          if (shouldResync && !(await syncState(false))) {
            break;
          }
        }
      } catch {
        if (!request.signal.aborted) {
          enqueue(sseEvent("server-error", { code: "INTERNAL", message: "Stream error" }));
        }
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
