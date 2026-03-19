export interface MatchSlopPlayerExample {
  id: string;
  situation: string;
  winningLine: string;
  styleTags: string[];
  notes: string;
}

// TODO: Replace these placeholder comedy examples with curated production few-shots.
export const MATCHSLOP_PLAYER_EXAMPLES: MatchSlopPlayerExample[] = [
  {
    id: "museum-feral",
    situation: "Someone says they love museums.",
    winningLine: "Perfect, I already act like a stolen artifact.",
    styleTags: ["self-own", "deadpan"],
    notes: "Short, weird, and confident.",
  },
  {
    id: "bread-threat",
    situation: "A match says they bake sourdough.",
    winningLine: "Finally, someone who can weaponize a starter.",
    styleTags: ["absurd", "specific"],
    notes: "Treat mundane hobbies like fantasy lore.",
  },
  {
    id: "mall-mystic",
    situation: "The chat turns flirty out of nowhere.",
    winningLine: "This chemistry feels illegal in a food court.",
    styleTags: ["romantic", "unhinged"],
    notes: "Keep it surprising without getting long.",
  },
  {
    id: "parking-lot-prophecy",
    situation: "The persona sounds skeptical.",
    winningLine: "You're right to doubt me. I do look like a false prophet of valet parking.",
    styleTags: ["self-own", "escalation"],
    notes: "Use strange imagery and a confident rhythm.",
  },
  {
    id: "cursed-domesticity",
    situation: "The chat needs a follow-up, not an opener.",
    winningLine: "Great, now our future arguments already have throw pillows.",
    styleTags: ["future-casting", "dry"],
    notes: "Continue the bit instead of restarting it.",
  },
];
