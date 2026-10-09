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
  v.literal("TURN_LIMIT"),
  v.literal("COMEBACK"),
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
  opening: v.string(),
  playerCallouts: v.array(
    v.object({ playerName: v.string(), verdict: v.string(), favoriteLine: nullableString }),
  ),
  favoriteMoment: v.string(),
  finalThought: v.string(),
});

/** The persona's answer to the message the room sent this round. */
export const replyValidator = v.object({
  text: v.string(),
  outcome: decisionValidator,
  moodDelta: v.number(),
  signalCategory: nullableString,
  sideComment: nullableString,
  nextSignal: nullableString,
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
    /** Feedback from the most recent reply, shown while players write the next one. */
    signal: v.optional(
      v.object({
        category: v.string(),
        sideComment: nullableString,
        nextSignal: v.string(),
        moodDelta: v.number(),
      }),
    ),
    /** Undefined while writing; null if the persona never wrote one. */
    postMortem: v.optional(v.union(postMortemValidator, v.null())),
  }).index("by_gameId", ["gameId"]),

  /** The dating-app chat, one message per side per round. */
  matchSlopMessages: defineTable({
    gameId: v.id("games"),
    turn: v.number(),
    speaker: v.union(v.literal("PLAYERS"), v.literal("PERSONA")),
    text: v.string(),
    authorName: v.optional(v.string()),
    /** The profile prompt an opener answered. */
    openerPromptText: v.optional(v.string()),
    mood: v.optional(v.number()),
    outcome: v.optional(v.union(decisionValidator, v.literal("COMEBACK"), v.literal("TURN_LIMIT"))),
  }).index("by_gameId_and_turn", ["gameId", "turn"]),
};
