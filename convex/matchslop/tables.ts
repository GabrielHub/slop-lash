import { defineTable } from "convex/server";
import { v } from "convex/values";
import { matchSlopIdentityValidator } from "../validators";

const nullableString = v.union(v.string(), v.null());

export const decisionValidator = v.union(
  v.literal("CONTINUE"),
  v.literal("DATE_SEALED"),
  v.literal("UNMATCHED"),
);

export const outcomeValidator = v.union(
  v.literal("IN_PROGRESS"),
  v.literal("DATE_SEALED"),
  v.literal("UNMATCHED"),
);

/** Mirrors MATCHSLOP_LEVELS in src/games/matchslop/types.ts. */
export const levelValidator = v.union(
  v.literal("dealbreaker"),
  v.literal("cringe"),
  v.literal("meh"),
  v.literal("cute"),
  v.literal("good"),
  v.literal("great"),
);

export const replySourceValidator = v.union(
  v.literal("model"),
  v.literal("fallback"),
  v.literal("declined"),
);

export const profileValidator = v.object({
  displayName: v.string(),
  backstory: nullableString,
  appearance: v.optional(nullableString),
  age: v.union(v.number(), v.null()),
  location: nullableString,
  bio: v.string(),
  tagline: nullableString,
  prompts: v.array(v.object({ id: v.string(), prompt: v.string(), answer: v.string() })),
  details: v.union(
    v.object({
      job: nullableString,
      school: nullableString,
      height: nullableString,
      languages: v.array(v.string()),
    }),
    v.null(),
  ),
});

export const postMortemValidator = v.object({
  verdicts: v.array(v.object({ playerName: v.string(), verdict: v.string() })),
  parting: v.string(),
});

/**
 * The persona's answer to the message the room sent this round. Only a
 * "model" reply carries a level; any other source is a canned stand-in that
 * never moves mood or points.
 */
export const replyValidator = v.object({
  source: replySourceValidator,
  level: v.union(levelValidator, v.null()),
  text: nullableString,
  thought: nullableString,
});

/** What the latest reply did, shown at REPLY and as tapbacks afterwards. */
export const signalValidator = v.object({
  level: v.union(levelValidator, v.null()),
  /** The level's mood delta (0 for a stand-in reply). */
  delta: v.number(),
  /** Points the sent line's author earned or lost for it. */
  points: v.number(),
  thought: nullableString,
  source: replySourceValidator,
  authorId: v.union(v.id("players"), v.null()),
});

export const matchslopTables = {
  matchSlopState: defineTable({
    gameId: v.id("games"),
    seekerIdentity: matchSlopIdentityValidator,
    personaIdentity: matchSlopIdentityValidator,
    personaModelId: v.string(),
    /** The hand-written persona the generator riffs on, and the fallback profile. */
    personaSeedId: v.string(),
    /** Tone examples handed to AI players. */
    playerExamples: v.array(v.string()),
    profile: v.optional(profileValidator),
    /** How the persona texts, written alongside the profile; never shown to players. */
    textingStyle: v.optional(v.string()),
    /** The portrait prompt written alongside the profile; never shown to players. */
    imagePrompt: v.optional(v.string()),
    /** Absent until requested; Free Play rooms never get a portrait. */
    portrait: v.optional(
      v.object({
        status: v.union(v.literal("PENDING"), v.literal("READY"), v.literal("FAILED")),
        url: v.optional(v.string()),
      }),
    ),
    mood: v.number(),
    outcome: outcomeValidator,
    comebackRound: v.optional(v.number()),
    /** The reply to the current round's message, once the persona has written it. */
    reply: v.optional(replyValidator),
    /** What the most recent reply did. */
    signal: v.optional(signalValidator),
    /** Undefined while writing; null if the persona never wrote one. */
    postMortem: v.optional(v.union(postMortemValidator, v.null())),
  }).index("by_gameId", ["gameId"]),

  /** The dating-app chat, one message per side per round. */
  matchSlopMessages: defineTable({
    gameId: v.id("games"),
    turn: v.number(),
    speaker: v.union(v.literal("PLAYERS"), v.literal("PERSONA")),
    text: v.string(),
    /** Who wrote a PLAYERS message; persona messages have none. */
    authorName: v.optional(v.string()),
    /** The same author's id, so the reply credits them without re-tallying. */
    authorId: v.optional(v.id("players")),
    /** The profile prompt an opener answered. */
    openerPromptText: v.optional(v.string()),
    /** Persona messages: the mood after this reply. */
    mood: v.optional(v.number()),
    /** Persona messages: what this reply decided. */
    outcome: v.optional(decisionValidator),
    /** Persona messages from the model: how the sent line was judged. */
    level: v.optional(levelValidator),
  }).index("by_gameId_and_turn", ["gameId", "turn"]),
};
