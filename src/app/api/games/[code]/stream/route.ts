import { publishGameStateEvent } from "@/lib/realtime-events";
import type { GameMetaPayload } from "../route-data";
import { findGameMeta, findGamePayloadByStatus, normalizePayload } from "../route-data";
import { stripUnrevealedVotes } from "../route-helpers";
import { HEARTBEAT_MIN_INTERVAL_MS } from "../sse-helpers";
import { createStateStreamResponse } from "../state-stream";
import { touchStreamHeartbeat } from "../stream-maintenance";

export const dynamic = "force-dynamic";

function getStateKey(meta: GameMetaPayload): string {
  return `${meta.version}:${meta.reactionsVersion}`;
}

function shouldEndGameStream(state: ReturnType<typeof normalizePayload>): boolean {
  if (state.status !== "FINAL_RESULTS") return false;

  const postMortemGeneration = (state.modeState as Record<string, unknown> | undefined)
    ?.postMortemGeneration as Record<string, unknown> | undefined;
  const status = postMortemGeneration?.status;

  return status !== "NOT_REQUESTED" && status !== "STREAMING";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const playerToken = url.searchParams.get("playerToken");
  const hostToken = url.searchParams.get("hostToken");

  return createStateStreamResponse({
    request,
    roomCode,
    playerToken,
    hostToken,
    findMeta: findGameMeta,
    getStateKey,
    shouldEndStream: shouldEndGameStream,
    loadState: async ({ roomCode: currentRoomCode, meta, stateKey }) => {
      const game = await findGamePayloadByStatus(currentRoomCode, meta.status, stateKey);
      if (!game) return null;

      const normalized = structuredClone(normalizePayload(game));
      if (normalized.status !== "FINAL_RESULTS") {
        stripUnrevealedVotes(normalized);
      }

      return normalized;
    },
    touchHeartbeat: async ({ meta, currentPlayerId, roomCode: currentRoomCode, hostToken: currentHostToken }) => {
      const stateChanged = await touchStreamHeartbeat({
        meta,
        currentPlayerId,
        roomCode: currentRoomCode,
        minTouchIntervalMs: HEARTBEAT_MIN_INTERVAL_MS,
        hostToken: currentHostToken,
      });

      if (stateChanged) {
        await publishGameStateEvent(meta.id);
      }

      return stateChanged;
    },
  });
}
