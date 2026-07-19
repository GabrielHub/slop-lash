import { isRoomCode, normalizeRoomCodeValue, ROOM_CODE_LENGTH } from "./room-code";

export { ROOM_CODE_LENGTH };

export function normalizeRoomInviteCode(roomCode: string): string {
  return normalizeRoomCodeValue(roomCode);
}

export function isRoomInviteCode(roomCode: string): boolean {
  return isRoomCode(roomCode);
}

function requireRoomInviteCode(roomCode: string): string {
  const normalized = normalizeRoomInviteCode(roomCode);
  if (!isRoomCode(normalized)) {
    throw new Error("Invalid room invite code");
  }
  return normalized;
}

export function buildRoomInvitePath(roomCode: string): string {
  return `/join/${requireRoomInviteCode(roomCode)}`;
}

function buildRoomInviteUrl(baseUrl: string, roomCode: string): string {
  return new URL(buildRoomInvitePath(roomCode), baseUrl).toString();
}

export function getRoomInviteDetails(roomCode: string) {
  const normalized = requireRoomInviteCode(roomCode);
  return {
    roomCode: normalized,
    path: buildRoomInvitePath(normalized),
    title: `Join room ${normalized}`,
    description: `Join room ${normalized} in SlopBox Party Pack — party games where AI plays too.`,
  };
}

export function buildRoomInviteShareData(baseUrl: string, roomCode: string) {
  const details = getRoomInviteDetails(roomCode);
  return {
    title: "Join my SlopBox room",
    text: `Join my SlopBox room ${details.roomCode}.`,
    url: buildRoomInviteUrl(baseUrl, details.roomCode),
  };
}
