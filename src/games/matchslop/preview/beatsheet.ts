import { spring, type SpringConfig } from "@/tutorial/timeline";

/**
 * The MatchSlop spot's beats, in seconds from the top of the loop. One micro
 * story: it's a match with Jules, Jules says "Impress me", two of the room's
 * lines go head to head and the votes pile onto the boat line, it gets sent,
 * Jules melts, the mood swings to a date, and the neon sign winks before a
 * heart iris closes back onto the next match.
 */
export const DURATION = 11;
/** The key-art second: the sign lit, its face on, the super settled. */
export const POSTER = 10;

export const T = {
  // Hook: the card swoops in, "It's a match" lands.
  cardIn: 0,
  stamp: 0.58,
  /** The card shrinks into Jules's chat avatar. */
  toAvatar: 1.3,

  // Jules opens.
  dots: 1.52,
  ask: 1.8,

  // The feed scrolls up and two of the room's lines deal in and type out.
  ballot: 2.32,
  deal: 2.38,
  dealStagger: 0.16,
  // The votes fly onto the boat line.
  vote: 3.38,
  voteStagger: 0.15,
  voteFly: 0.45,
  crown: 4.15,
  /** The loser swipes away. */
  nope: 4.26,

  // Sent, and Jules replies; the feed follows the newest message.
  send: 4.42,
  follow: 4.62,
  typing: 4.8,
  reply: 5.25,
  tapback: 5.8,

  // The meter comes up under the reply, and the mood swings to a date.
  scroll: 6.85,
  chip: 7.08,
  chipFly: 7.28,
  /** The chip lands in the heart and the mood springs up. */
  land: 7.58,
  dateStamp: 7.72,

  // End slate: the heart becomes the neon sign.
  slate: 8.5,
  /** The heart arrives and its neon tube strikes. */
  strike: 8.8,
  word: 9.0,
  face: 9.4,
  superAt: 9.25,
  wink: 10.12,
  /** The heart iris starts closing; it shuts on the loop point. */
  close: 10.45,
} as const;

/** MatchSlop's floaty entrance: a soft spring that overshoots about 10%. */
export const FLOAT: SpringConfig = { stiffness: 150, damping: 15, mass: 1 };

/** Where the neon heart sits on the end slate, and where the iris shuts and reopens. */
export const HEART_SPOT = { x: 960, y: 300 } as const;

/**
 * The chat is one feed that scrolls to keep the newest thing centred: a feed
 * point at y shows on the board at y + `feedY(t)`. Each value frames a beat.
 */
export const FEED = {
  /** "Impress me", centred. */
  ask: 424,
  /** Her line on top, the two drafts below it. */
  ballot: 176,
  /** Up a little, to make room for the votes under the winner. */
  vote: 92,
  /** Our sent line and her reply. */
  reply: -180,
  /** The meter, which sits in the feed under the reply. */
  mood: -800,
} as const;
/** The meter section's top, in feed px: its own layout reads as board px once the feed lands on it. */
export const MOOD_Y = -FEED.mood;

const FOLLOW: SpringConfig = { stiffness: 140, damping: 20, mass: 1 };
const PAGE: SpringConfig = { stiffness: 170, damping: 23, mass: 1 };

export function feedY(t: number): number {
  return (
    FEED.ask +
    (FEED.ballot - FEED.ask) * spring(t - T.ballot, FOLLOW) +
    (FEED.vote - FEED.ballot) * spring(t - (T.vote - 0.15), FOLLOW) +
    (FEED.reply - FEED.vote) * spring(t - T.follow, FOLLOW) +
    (FEED.mood - FEED.reply) * spring(t - T.scroll, PAGE)
  );
}
