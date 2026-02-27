import { prisma } from "@/lib/db";

/** Generate a random 4-character room code using unambiguous characters. */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Try up to 10 times to generate a room code not already in use. */
export async function generateUniqueRoomCode(): Promise<string | null> {
  for (let i = 0; i < 10; i++) {
    const roomCode = generateRoomCode();
    const existing = await prisma.game.findUnique({ where: { roomCode } });
    if (!existing) return roomCode;
  }
  return null;
}
