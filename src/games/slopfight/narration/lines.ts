// Shared narration line contract and text shaping. No room, renderer or audio state.
import type { ArenaId } from "../arenas";
import type { Champion, Narration } from "../sheet";
import type { Side } from "../sim/types";
import type { BodyPlan, MoveType, PropTag, Trait } from "../vocab";

export const LINE_MAX = 70;
/** Minimum spacing between the starts of two spoken fight lines. */
export const FIGHT_SPEECH_GAP_MS = 2_500;
/** Minimum spacing between two caption-only fight lines (or a caption and a spoken line). */
export const FIGHT_CAPTION_GAP_MS = 1_200;
/** The opening call is a bark: the next line may follow this long after it is said. */
export const FIGHT_BARK_TAIL_MS = 300;

export type VoiceBeat =
  | "arenas"
  | "build"
  | "forged"
  | "upgradeReveal"
  | "roster"
  | "faceOff"
  | "final"
  | "thirdPlace"
  | "walkOn"
  | "start"
  | "firstContact"
  | "bigHit"
  | "miracle"
  | "counter"
  | "throw"
  | "whiff"
  | "immune"
  | "slipped"
  | "broken"
  | "edge"
  | "ringOut"
  | "ko"
  | "selfDamage"
  | "showboat"
  | "finale"
  | "suddenDeath"
  | "timeout"
  | "result"
  | "standings"
  | "upgrade"
  | "podium";

export interface VoiceLine {
  /** Stable per beat in a game: captions and TTS dedupe on it. */
  key: string;
  text: string;
  /** Whether TTS voices it. Captions show every line. */
  speak: boolean;
  /** Higher wins when lines compete for the same moment. */
  priority: number;
  beat: VoiceBeat;
  /** The fighter the line is about, when it is about one. */
  side?: Side;
  /** Fight lines: when it lands, in ms of sim time from the fight's t = 0. */
  atMs?: number;
}

/** The parts of a champion the Voice talks about. */
export interface VoiceFighter {
  name: string;
  bodyPlan: BodyPlan;
  traits: readonly Trait[];
  item: PropTag | null;
  moves: readonly { name: string; type: MoveType }[];
  narration: Narration;
  /** The owning player's name; null for a house champion. */
  owner: string | null;
}

export function toVoiceFighter(champion: Champion, owner: string | null = null): VoiceFighter {
  return {
    name: champion.name,
    bodyPlan: champion.bodyPlan,
    traits: champion.traits,
    item: champion.item,
    moves: champion.moves,
    narration: champion.narration,
    owner,
  };
}

/** One fight as the Voice needs it. */
export interface VoiceFight {
  round: number;
  step: number;
  arena: ArenaId;
  a: VoiceFighter;
  b: VoiceFighter;
  /** How many fights each champion fought before this one (rotates its pool lines). */
  appearance?: { A: number; B: number };
  /** The matchup call's walk-on lines, [A, B]. */
  walkOn?: readonly string[];
  isFinal?: boolean;
  isThirdPlace?: boolean;
}

// Fight beats in the order they win a contested moment. Real fights are full
// of counters (about one every 2 s) and throws, so those sit below the rarer
// story beats and are also capped per fight (MAX_PER_FIGHT).
export const PRIORITY = {
  ko: 100,
  ringOut: 100,
  suddenDeath: 90,
  finale: 88,
  start: 85,
  timeout: 85,
  firstContact: 80,
  miracle: 75,
  edge: 72,
  showboat: 71,
  bigHit: 70,
  throw: 60,
  counter: 58,
  immune: 40,
  slipped: 40,
  selfDamage: 30,
  broken: 25,
  whiff: 20,
  phase: 60,
  roster: 50,
} as const;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Collapses whitespace and swaps em/en dashes for commas (the house style has none). */
export function cleanLine(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^,\s*|\s*,$/g, "")
    .trim();
}

export function fitsLine(text: string): boolean {
  return text.length > 0 && text.length <= LINE_MAX && !/[—–]/.test(text);
}

/** A rough spoken length, for spacing lines so the Voice never talks over itself. */
export function speechMs(text: string): number {
  return 400 + 62 * text.length;
}

export type Vars = Record<string, string | null | undefined>;

/**
 * Names that read wrong after "the": ones with their own article, a possessive,
 * a number, or a phrase that opens with a preposition ("Under the Fridge").
 */
const NO_ARTICLE =
  /^(?:(?:the|a|an|my|your|his|her|its|our|their|this|that|no|under|over|into|onto|off|out|up|down|through|across|behind|around|from|with|without|in|on|at|to|by|for|after|before|beneath|beyond|inside|outside|past|upon)\b|\S+'s\b|\d)/i;

/** Fills {slots}; null when a slot has no value, so that template is skipped. */
export function fillTemplate(template: string, vars: Vars): string | null {
  let missing = false;
  // "a {slot}" becomes "an umbrella" before a vowel; "the {slot}" drops its
  // "the" before a name that reads wrong with one ("The Under the Fridge!").
  const text = template.replace(
    /(?:\b([aA]|[tT]he) )?\{(\w+)\}/g,
    (_, article: string | undefined, slot: string) => {
      const lower = slot.charAt(0).toLowerCase() + slot.slice(1);
      const value = vars[lower];
      if (value === null || value === undefined || value === "") {
        missing = true;
        return "";
      }
      const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
      const word = slot === lower ? value : capitalize(value);
      if (!article) return word;
      if (/^the$/i.test(article)) {
        if (!NO_ARTICLE.test(value)) return `${article} ${word}`;
        return article === "The" ? capitalize(word) : word;
      }
      return `${/^[aeiou]/i.test(word) ? `${article}n` : article} ${word}`;
    },
  );
  return missing ? null : cleanLine(text);
}
