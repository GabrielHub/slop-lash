import { getGameDefinition } from "@/games/registry";
import { LEADERBOARD_TAG } from "@/games/core/constants";
import { applyCompletedGameToLeaderboardAggregate } from "@/lib/leaderboard-aggregate";
import { revalidateTag } from "next/cache";
import { publishGameStateEvent, waitForRealtimeEvent } from "@/lib/realtime-events";
import { findAuthenticatedPlayer } from "@/lib/player-auth";
import { isDeadlineExpired } from "../../route-helpers";
import type { ControllerMetaPayload } from "../controller-data";
import { findControllerMeta, findControllerPayload } from "../controller-data";
import { touchStreamHeartbeat } from "../../stream-maintenance";
import {
  sseEvent,
  SSE_HEADERS,
  SSE_KEEPALIVE_INTERVAL_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
} from "../../sse-helpers";

export const dynamic = "force-dynamic";

const SAFETY_CHECK_INTERVAL_MS = 10_000;
const IDLE_WAKE_INTERVAL_MS = 30_000;
const PERIODIC_META_RESYNC_MS = 60_000;
const lastSafetyCheck = new Map<string, number>();

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
  const playerToken = url.searchParams.get("playerToken");

  const encoder = new TextEncoder();
  let lastVersion = -1;
  let lastKeepaliveAt = Date.now();
  let latestMeta: ControllerMetaPayload | null = null;
  let lastMetaSyncAt = 0;
  let resolvedPlayerId: string | null = null;
  let playerResolved = false;
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

      async function runWritingSafety(meta: ControllerMetaPayload): Promise<boolean> {
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

      async function enforceDeadline(meta: ControllerMetaPayload): Promise<boolean> {
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

      async function touchHeartbeat(meta: ControllerMetaPayload, currentPlayerId: string | null) {
        if (!currentPlayerId) return;

        const stateChanged = await touchStreamHeartbeat({
          meta,
          currentPlayerId,
          roomCode,
          minTouchIntervalMs: HEARTBEAT_MIN_INTERVAL_MS,
        });

        if (stateChanged) {
          await publishGameStateEvent(meta.id);
        }
      }

      async function syncState(force: boolean): Promise<boolean> {
        let meta =
          !force && latestMeta && Date.now() - lastMetaSyncAt < PERIODIC_META_RESYNC_MS
            ? latestMeta
            : await findControllerMeta(roomCode);
        if (!meta) {
          enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
          return false;
        }

        latestMeta = meta;
        lastMetaSyncAt = Date.now();
        if (!playerResolved) {
          resolvedPlayerId = (await findAuthenticatedPlayer(meta.id, playerToken))?.id ?? null;
          playerResolved = true;
        }

        const deadlineChanged = await enforceDeadline(meta);
        if (deadlineChanged) {
          meta = await findControllerMeta(roomCode);
          if (!meta) {
            enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
            return false;
          }
          latestMeta = meta;
          lastMetaSyncAt = Date.now();
        }

        const safetyChanged = await runWritingSafety(meta);
        if (safetyChanged) {
          meta = await findControllerMeta(roomCode);
          if (!meta) {
            enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
            return false;
          }
          latestMeta = meta;
          lastMetaSyncAt = Date.now();
        }

        if (!force && !deadlineChanged && !safetyChanged && meta.version === lastVersion) {
          return true;
        }

        const payload = await findControllerPayload(
          roomCode,
          resolvedPlayerId,
          meta.version,
          meta.status,
        );
        if (!payload) {
          enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
          return false;
        }

        enqueue(sseEvent("state", payload));
        lastVersion = payload.version;
        lastKeepaliveAt = Date.now();

        if (payload.status === "FINAL_RESULTS") {
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
          void touchHeartbeat(meta, resolvedPlayerId).finally(() => {
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
