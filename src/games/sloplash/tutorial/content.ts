import { getPlayerColor } from "@/lib/player-colors";

/**
 * The invented table the tutorial plays with: five friends and one AI, one
 * matchup, one runaway answer. Nothing here is a real person or a real round.
 */

export interface CastMember {
  name: string;
  /** An AI player's model, or null for a human. */
  modelId: string | null;
}

export const AI_MODEL = "anthropic/claude-haiku-5.5";

export const YOU: CastMember = { name: "You", modelId: null };
export const RAFI: CastMember = { name: "Rafi", modelId: null };
export const KIT: CastMember = { name: "Kit", modelId: null };
export const DANA: CastMember = { name: "Dana", modelId: null };
export const MO: CastMember = { name: "Mo", modelId: null };
export const BOT: CastMember = { name: "Haiku", modelId: AI_MODEL };

/** The humans, in the order they join the intro's line-up. */
export const HUMANS = [YOU, RAFI, KIT, DANA, MO] as const;
/** Everyone who votes on You vs Rafi: the whole table but the two authors. */
export const VOTERS = [KIT, DANA, MO, BOT] as const;

/** A player's own colour: the AI's purple, or the human's name colour. */
export function colorOf(member: CastMember): string {
  return member.modelId ? "var(--ai-badge)" : getPlayerColor(member.name);
}

export const PROMPT = "The worst thing to hear from your pilot";
export const MY_ANSWER = "Anyone here know how to land?";
export const RIVAL_ANSWER = "We're out of Wi-Fi. And fuel.";

export const PROMPT_2 = "A rejected name for a pizza place";
/** A draft that runs past the cap; the phone keeps only the first 80 characters. */
export const RAMBLE =
  "Okay so hear me out. It's a pizza place, but every pizza is a metaphor for my feelings";

export const MAX_CHARS = 80;
/** The phone's counter shows from here. */
export const COUNT_FROM = 60;

/** Points for one vote, by round: x1, x2, x4. */
export const ROUND_VALUES = [100, 200, 400] as const;
