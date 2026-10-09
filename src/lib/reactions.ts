export const REACTION_EMOJIS = {
  laugh: "😂",
  fire: "🔥",
  skull: "💀",
  clap: "👏",
  puke: "🤮",
  sleep: "😴",
  eyes: "👀",
  hundred: "💯",
  target: "🎯",
  clown: "🤡",
} as const;

export type ReactionEmoji = keyof typeof REACTION_EMOJIS;

export const REACTION_EMOJI_KEYS = Object.keys(REACTION_EMOJIS) as ReactionEmoji[];

export function isValidReactionEmoji(emoji: string): emoji is ReactionEmoji {
  return Object.hasOwn(REACTION_EMOJIS, emoji);
}
