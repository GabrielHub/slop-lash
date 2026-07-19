export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/u;

export function normalizeRoomCodeValue(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

export function isRoomCode(roomCode: string): boolean {
  return ROOM_CODE_PATTERN.test(normalizeRoomCodeValue(roomCode));
}
