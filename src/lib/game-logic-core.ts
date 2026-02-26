import { prisma } from "./db";
import { getRandomPrompts } from "./prompts";
import { FORFEIT_TEXT, type RoundHistoryEntry } from "./ai";

export { MAX_PLAYERS, MAX_SPECTATORS, MIN_PLAYERS, WRITING_DURATION_SECONDS, VOTE_PER_PROMPT_SECONDS, REVEAL_SECONDS, HOST_STALE_MS } from "./game-constants";

/** The phase that was advanced to, or null if no transition occurred. */
export type PhaseAdvanceResult = "VOTING" | "VOTING_SUBPHASE" | "ROUND_RESULTS" | null;

/** Shape returned by the previous-rounds query for building AI history. */
type PreviousRound = {
  roundNumber: number;
  prompts: {
    text: string;
    responses: { id: string; playerId: string; text: string }[];
    votes: { responseId: string | null }[];
  }[];
};

/**
 * Build a chronological history of a player's past prompts, jokes, and results.
 * Used to give AI players context about their performance in previous rounds.
 */
export function buildPlayerHistory(
  playerId: string,
  previousRounds: PreviousRound[],
): RoundHistoryEntry[] {
  const entries: RoundHistoryEntry[] = [];

  for (const round of previousRounds) {
    for (const prompt of round.prompts) {
      const playerResponse = prompt.responses.find((r) => r.playerId === playerId);
      if (!playerResponse) continue;

      const opponent = prompt.responses.find((r) => r.playerId !== playerId);
      const playerForfeited = playerResponse.text === FORFEIT_TEXT;
      const opponentForfeited = opponent?.text === FORFEIT_TEXT;

      let won: boolean;
      if (playerForfeited) {
        won = false;
      } else if (opponentForfeited) {
        won = true;
      } else {
        const castVotes = prompt.votes.filter((v) => v.responseId != null);
        const playerVoteCount = castVotes.filter((v) => v.responseId === playerResponse.id).length;
        const opponentVoteCount = opponent
          ? castVotes.filter((v) => v.responseId === opponent.id).length
          : 0;
        won = playerVoteCount > opponentVoteCount;
      }

      entries.push({
        round: round.roundNumber,
        prompt: prompt.text,
        yourJoke: playerResponse.text,
        won,
        winningJoke: !won && opponent && !opponentForfeited ? opponent.text : undefined,
      });
    }
  }

  return entries;
}

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

export interface PromptAssignment {
  promptText: string;
  playerIds: [string, string];
}

/** Pair players with prompts in a round-robin pattern, excluding previously used prompts. */
export function assignPrompts(
  playerIds: string[],
  count: number,
  exclude: Set<string> = new Set(),
): PromptAssignment[] {
  const promptTexts = getRandomPrompts(count, exclude);
  const assignments: PromptAssignment[] = [];

  for (let i = 0; i < count; i++) {
    const p1 = playerIds[i % playerIds.length];
    const p2 = playerIds[(i + 1) % playerIds.length];
    const text = promptTexts[i] ?? `Prompt #${i + 1}: Make us laugh!`;
    assignments.push({ promptText: text, playerIds: [p1, p2] });
  }

  return assignments;
}
