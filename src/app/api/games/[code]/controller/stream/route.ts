import { publishGameStateEvent } from "@/lib/realtime-events";
import { findControllerMeta, findControllerPayload } from "../controller-data";
import { HEARTBEAT_MIN_INTERVAL_MS } from "../../sse-helpers";
import { createStateStreamResponse } from "../../state-stream";
import { touchStreamHeartbeat } from "../../stream-maintenance";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const url = new URL(request.url);
  const playerToken = url.searchParams.get("playerToken");

  return createStateStreamResponse({
    request,
    roomCode,
    playerToken,
    findMeta: findControllerMeta,
    getStateKey: (meta) => String(meta.version),
    loadState: ({ roomCode: currentRoomCode, meta, playerId }) =>
      findControllerPayload(currentRoomCode, playerId, meta.version, meta.status),
    touchHeartbeat: async ({ meta, currentPlayerId, roomCode: currentRoomCode }) => {
      if (!currentPlayerId) return false;

      const stateChanged = await touchStreamHeartbeat({
        meta,
        currentPlayerId,
        roomCode: currentRoomCode,
        minTouchIntervalMs: HEARTBEAT_MIN_INTERVAL_MS,
      });

      if (stateChanged) {
        await publishGameStateEvent(meta.id);
      }

      return stateChanged;
    },
  });
}
