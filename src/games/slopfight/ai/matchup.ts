import { Output } from "ai";
import { z } from "zod";
import { runStructured } from "@/lib/ai/run";
import type { ArenaId } from "../arenas";
import { MATCHUP_NOTES_MAX, NARRATION_LINE_MAX, NOTE_REASON_MAX } from "../constants";
import {
  MatchupNoteSchema,
  MODIFIER_SPECS,
  resolveModifiers,
  type MatchupNote,
} from "../modifiers";
import { cleanText, type Champion } from "../sheet";
import { MATCHUP_PROMPT_VERSION, matchupInstructions, matchupPrompt } from "./matchup-prompt";
import { callSettings, modelText, withFallback, type AiOutcome, type CallOptions } from "./shared";

const MATCHUP_OUTPUT = Output.object({
  schema: z.object({
    notes: z.array(MatchupNoteSchema).describe("2 to 4 Matchup Notes"),
    walkOnA: z.string().describe(`Fighter A's walk-on line, at most ${NARRATION_LINE_MAX} characters`),
    walkOnB: z.string().describe(`Fighter B's walk-on line, at most ${NARRATION_LINE_MAX} characters`),
  }),
});

export interface WriteMatchupOptions extends CallOptions {
  a: Champion;
  b: Champion;
  arena: ArenaId;
}

export type MatchupResult = AiOutcome<{ notes: MatchupNote[]; walkOn: [string, string] }>;

/**
 * The notes the game keeps: at most MATCHUP_NOTES_MAX, each value clamped to
 * its key's note range (flags to 0 or 1), the reason cleaned, and every note
 * that `resolveModifiers` drops (a flag past the cap, a zero) left out. Kept
 * values are the clamped ones, not the cap-scaled ones: the sim and the stage
 * re-run `resolveModifiers` on exactly these notes and get the same numbers.
 */
export function settleNotes(
  a: Champion,
  b: Champion,
  arena: ArenaId,
  notes: readonly MatchupNote[],
): MatchupNote[] {
  const clamped: MatchupNote[] = [];
  for (const note of notes) {
    if (clamped.length >= MATCHUP_NOTES_MAX) break;
    const spec = MODIFIER_SPECS[note.modifies];
    if (!spec || (note.side !== "A" && note.side !== "B") || !Number.isFinite(note.value)) continue;
    const value =
      spec.kind === "flag"
        ? note.value > 0
          ? 1
          : 0
        : Math.round(Math.min(spec.noteMax, Math.max(spec.noteMin, note.value)) * 100) / 100;
    const reason = cleanText(modelText(note.reason, NOTE_REASON_MAX), NOTE_REASON_MAX);
    if (value === 0 || !reason) continue;
    clamped.push({ side: note.side, modifies: note.modifies, value, reason });
  }
  const applied = resolveModifiers(a, b, arena, clamped).notes;
  return clamped.filter((_, index) => applied[index] && !applied[index].dropped);
}

/**
 * 2-4 Matchup Notes (clamped through the `resolveModifiers` caps) and a
 * walk-on line per fighter. Haiku first, then Sonnet on any failure or when
 * no note survives.
 */
export async function writeMatchup(options: WriteMatchupOptions): Promise<MatchupResult> {
  const { a, b, arena } = options;
  return withFallback(
    (modelId, fallback) =>
      runStructured(fallback ? "slopfight.matchupFallback" : "slopfight.matchup", {
        ...callSettings(options, modelId),
        promptVersion: MATCHUP_PROMPT_VERSION,
        instructions: matchupInstructions(),
        prompt: matchupPrompt(a, b, arena),
        output: MATCHUP_OUTPUT,
      }),
    (output) => {
      const notes = settleNotes(a, b, arena, output.notes);
      if (notes.length === 0) return null;
      const line = (text: string, champion: Champion) =>
        cleanText(modelText(text, NARRATION_LINE_MAX), NARRATION_LINE_MAX) || champion.narration.walkOn[0]!;
      return { notes, walkOn: [line(output.walkOnA, a), line(output.walkOnB, b)] };
    },
  );
}
