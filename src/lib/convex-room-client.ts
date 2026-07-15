import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import {
  getConvexRoomSession,
  setConvexRoomSession,
  type ConvexRoomSessionInput,
  type RoomSessionStorage,
} from "./convex-room-session";

type RoomSessionResult = FunctionReturnType<typeof api.rooms.create>;

export function roomResultToSessionInput(result: RoomSessionResult): ConvexRoomSessionInput {
  const isHost = result.role === "HOST";
  return {
    roomCode: result.roomCode,
    gameId: result.gameId,
    gameType: result.gameType,
    playerCapability: result.playerId ? result.capability : null,
    hostCapability: isHost ? result.capability : null,
    playerId: result.playerId,
    playerName: result.playerName,
    playerType: result.playerType,
  };
}

export function persistRoomSessionResult(
  result: RoomSessionResult,
  storage?: RoomSessionStorage,
): void {
  const input = roomResultToSessionInput(result);
  const existing = getConvexRoomSession(result.roomCode, storage);

  if (existing?.gameId === result.gameId && existing.gameType === result.gameType) {
    if (result.role !== "HOST") {
      input.hostCapability = existing.hostCapability;
    } else if (result.playerId === null) {
      input.playerCapability = existing.playerCapability;
      input.playerId = existing.playerId;
      input.playerName = existing.playerName;
      input.playerType = existing.playerType;
    }
  }

  if (!setConvexRoomSession(input, storage)) {
    throw new Error("Could not save the room session in this browser");
  }
}
