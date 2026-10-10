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

export function isValidReactionEmoji(emoji: string): emoji is ReactionEmoji {
  return Object.hasOwn(REACTION_EMOJIS, emoji);
}

/** The emoji for a reaction key, or the key itself if it is unknown. */
export function reactionEmoji(key: string): string {
  return isValidReactionEmoji(key) ? REACTION_EMOJIS[key] : key;
}
