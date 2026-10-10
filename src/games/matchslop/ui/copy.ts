import type { StampTone } from "@/room/moment";
import { MATCHSLOP_WINNER_BONUS } from "../config/game-config";
import { MATCHSLOP_DATE_LINE } from "../types";
import {
  latestPersona,
  type ChatMessage,
  type Level,
  type MatchslopMode,
  type Verdict,
} from "./primitives";

/** Every MatchSlop string on the stage and the phone, so the two never drift. */

export const LEVEL_EMOJI: Record<Level, string> = {
  great: "😍",
  good: "😊",
  cute: "🙂",
  meh: "😐",
  cringe: "😬",
  dealbreaker: "💀",
};

export const LEVEL_WORD: Record<Level, string> = {
  great: "Great",
  good: "Good",
  cute: "Cute",
  meh: "Meh",
  cringe: "Cringe",
  dealbreaker: "Dealbreaker",
};

export const LEVEL_TONE: Record<Level, "win" | "ink" | "fail"> = {
  great: "win",
  good: "win",
  cute: "win",
  meh: "ink",
  cringe: "fail",
  dealbreaker: "fail",
};

export const TONE_TEXT: Record<"win" | "ink" | "fail", string> = {
  win: "text-win",
  ink: "text-ink",
  fail: "text-fail",
};

export const NO_SCORE = "No score";

/** The reaction stamp: "😊 Good", or "No score" when the reply wasn't the model's. */
export function reactionOf(level: Level | null): { text: string; tone: StampTone } {
  if (!level) return { text: NO_SCORE, tone: "ink" };
  return { text: `${LEVEL_EMOJI[level]} ${LEVEL_WORD[level]}`, tone: LEVEL_TONE[level] };
}

/** "♥ +10", "♥ 0", "♥ −20" (a true minus). */
export function heartDelta(delta: number): string {
  if (delta > 0) return `♥ +${delta}`;
  if (delta < 0) return `♥ −${Math.abs(delta)}`;
  return "♥ 0";
}

/** "+50", "0", "−100" with a true minus, for points that may go negative. */
export function signedPoints(points: number): string {
  if (points > 0) return `+${Math.round(points).toLocaleString()}`;
  if (points < 0) return `−${Math.abs(Math.round(points)).toLocaleString()}`;
  return "0";
}

/** An ending's label; compare `verdict`, never `text`, which is copy. */
export type Ending = { verdict: Verdict; text: string; tone: "win" | "fail" };

const ENDINGS: Record<Verdict, Ending> = {
  DATE: { verdict: "DATE", text: "It's a date", tone: "win" },
  UNMATCHED: { verdict: "UNMATCHED", text: "Unmatched", tone: "fail" },
  NO_SECOND_DATE: { verdict: "NO_SECOND_DATE", text: "No second date", tone: "fail" },
};

export const UNMATCHED: Ending = ENDINGS.UNMATCHED;

export function endingOf(verdict: Verdict): Ending {
  return ENDINGS[verdict];
}

/**
 * What a persona message stamps, if anything: a date, the game's final
 * verdict, or (a last shot, while the game goes on) "Unmatched".
 */
export function stampOf(message: ChatMessage | undefined, mode: MatchslopMode): Ending | null {
  if (!message || message.speaker !== "PERSONA") return null;
  if (message.outcome === "DATE_SEALED") return ENDINGS.DATE;
  if (message.outcome !== "UNMATCHED") return null;
  if (latestPersona(mode.messages)?.id === message.id && mode.verdict) return ENDINGS[mode.verdict];
  return ENDINGS.UNMATCHED;
}

/** The phone's outcome titles carry an exclamation for the date. */
export function phoneEnding(verdict: Verdict): Ending {
  return verdict === "DATE" ? { ...ENDINGS.DATE, text: "It's a date!" } : ENDINGS[verdict];
}

export const COPY = {
  findingMatch: "Finding your match…",
  tonightsMatch: "Tonight's match",
  itsAMatch: "It's a match",
  writeOpener: (name: string) => `Write ${name} an opener`,
  writeReply: (name: string) => `Write ${name} a reply`,
  winBack: (name: string) => `Win ${name} back`,
  textsIn: "Texts in",
  whichOne: "Which one do we send?",
  humanDouble: "Human votes count double",
  sent: "Sent",
  sentBonus: `Sent +${MATCHSLOP_WINNER_BONUS}`,
  oneLastShotNext: "One last shot is next",
  lastMessage: "Last message",
  lastMessageKicker: `Hit ${MATCHSLOP_DATE_LINE} to seal the date`,
  oneLastShot: "One last shot",
  comebackKicker: (name: string) => `Only Good or Great wins ${name} back`,
  unmatchLabel: "Unmatch",
  dateLabel: "Date",
  photo: "Photo",
  wholeChat: "The whole chat",
  aiUsage: "AI usage",
  // Phone
  pickOne: "Pick one to reply to",
  yourOpener: "Your opener…",
  yourReply: "Your reply…",
  winBackPlaceholder: (name: string) => `Win ${name} back…`,
  send: "Send",
  sending: "Sending…",
  lockedIn: "Locked in",
  nextRound: "You're in next round",
  eyesOnTv: "Eyes on the TV",
  yours: "Yours",
  voted: (letter: string) => `Voted ${letter}`,
  yourText: "Your text:",
  noVotes: "No votes this time",
  gotSent: "Your text got sent!",
  youPicked: "You picked it ✓",
  isTyping: (name: string) => `${name} is typing…`,
  onYou: (name: string) => `${name} on you`,
  points: (points: number) => `${points.toLocaleString()} points`,
} as const;

/** "A".."H" for ballot position `index`. */
export function letterOf(index: number): string {
  return String.fromCharCode(65 + index);
}

/** "29 · Echo Park", without whatever is missing; null when both are. */
export function metaLine(profile: MatchslopMode["persona"]["profile"]): string | null {
  if (!profile) return null;
  const parts = [profile.age === null ? null : String(profile.age), profile.location];
  const line = parts.filter((part): part is string => !!part).join(" · ");
  return line || null;
}
