import { ConvexError } from "convex/values";
import {
  isRoomCode,
  normalizeRoomCodeValue,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "../src/lib/room-code";

export function createRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

export function normalizeRoomCode(roomCode: string): string {
  const normalized = normalizeRoomCodeValue(roomCode);
  if (!isRoomCode(normalized)) {
    throw new ConvexError("Room code must be 6 characters using A-Z or 2-9");
  }
  return normalized;
}

export function normalizePlayerName(name: string): {
  name: string;
  normalizedName: string;
} {
  const withoutTags = name.replace(/<[^>]*>/gu, "");
  const withoutControlCharacters = Array.from(withoutTags, (character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) ? "" : character;
  }).join("");
  const cleanName = withoutControlCharacters.trim().slice(0, 20);
  if (cleanName.length === 0) throw new ConvexError("Player name is required");
  return { name: cleanName, normalizedName: cleanName.toLocaleLowerCase("en-US") };
}
