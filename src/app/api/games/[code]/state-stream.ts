import type { GameStatus } from "@/generated/prisma/client";
import type { GameType } from "@/games/core/types";
import { runGameStateMaintenance } from "@/games/core/runtime";
import { findAuthenticatedPlayer } from "@/lib/player-auth";
import { waitForRealtimeEvent } from "@/lib/realtime-events";
import {
  HEARTBEAT_MIN_INTERVAL_MS,
  SSE_HEADERS,
  SSE_KEEPALIVE_INTERVAL_MS,
  sseEvent,
} from "./sse-helpers";

const SAFETY_CHECK_INTERVAL_MS = 10_000;
const IDLE_WAKE_INTERVAL_MS = 30_000;
const PERIODIC_META_RESYNC_MS = 30_000;

type StreamMeta = {
  id: string;
  gameType: GameType;
  status: GameStatus;
  phaseDeadline: Date | null;
};

type CreateStateStreamResponseOptions<TMeta extends StreamMeta, TState extends { status: string }> = {
  request: Request;
  roomCode: string;
  playerToken: string | null;
  hostToken?: string | null;
  findMeta: (roomCode: string) => Promise<TMeta | null>;
  getStateKey: (meta: TMeta) => string;
  loadState: (params: {
    roomCode: string;
    meta: TMeta;
    playerId: string | null;
    stateKey: string;
  }) => Promise<TState | null>;
  touchHeartbeat: (params: {
    meta: TMeta;
    currentPlayerId: string | null;
    roomCode: string;
    hostToken: string | null;
  }) => Promise<boolean>;
  shouldEndStream?: (state: TState) => boolean;
};

function getDeadlineWaitMs(phaseDeadline: Date | null): number {
  if (!phaseDeadline) return Number.POSITIVE_INFINITY;
  return Math.max(phaseDeadline.getTime() - Date.now(), 0);
}

export function createStateStreamResponse<
  TMeta extends StreamMeta,
  TState extends { status: string },
>(options: CreateStateStreamResponseOptions<TMeta, TState>) {
  const {
    request,
    roomCode,
    playerToken,
    hostToken = null,
    findMeta,
    getStateKey,
    loadState,
    touchHeartbeat,
    shouldEndStream = (state) => state.status === "FINAL_RESULTS",
  } = options;

  const encoder = new TextEncoder();
  let lastStateKey = "";
  let lastKeepaliveAt = Date.now();
  let latestMeta: TMeta | null = null;
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

      async function syncState(force: boolean): Promise<boolean> {
        const meta =
          !force && latestMeta && Date.now() - lastMetaSyncAt < PERIODIC_META_RESYNC_MS
            ? latestMeta
            : await findMeta(roomCode);
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

        const nextStateKey = getStateKey(meta);
        if (!force && nextStateKey === lastStateKey) {
          return true;
        }

        const state = await loadState({
          roomCode,
          meta,
          playerId: resolvedPlayerId,
          stateKey: nextStateKey,
        });
        if (!state) {
          enqueue(sseEvent("server-error", { code: "NOT_FOUND", message: "Game not found" }));
          return false;
        }

        enqueue(sseEvent("state", state));
        lastStateKey = nextStateKey;
        lastKeepaliveAt = Date.now();

        if (shouldEndStream(state)) {
          enqueue(sseEvent("done", {}));
          return false;
        }

        return true;
      }

      try {
        if (!(await syncState(true))) return;

        // Run maintenance after the first state push so clients get data immediately.
        // The lock ensures only one concurrent caller does actual work.
        if (latestMeta) {
          void runGameStateMaintenance(latestMeta.id, latestMeta.gameType).then(
            async (changed) => {
              if (changed && !request.signal.aborted) await syncState(true);
            },
          );
        }

        heartbeatTimer = setInterval(() => {
          const meta = latestMeta;
          if (!meta || heartbeatBusy || request.signal.aborted) return;

          heartbeatBusy = true;
          void touchHeartbeat({
            meta,
            currentPlayerId: resolvedPlayerId,
            roomCode,
            hostToken,
          }).finally(() => {
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
          const stateChanged = await runGameStateMaintenance(meta.id, meta.gameType);

          if (stateChanged) {
            if (!(await syncState(true))) {
              break;
            }
            continue;
          }

          if (!(await syncState(false))) {
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
