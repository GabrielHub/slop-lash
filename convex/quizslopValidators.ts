import { v } from "convex/values";

/**
 * QuizSlop mode-local Convex validators. These mirror the closed unions in
 * src/games/quizslop/types.ts; keep the two files in sync when a union
 * changes. Hidden tier and answer keys never appear in a player-facing view
 * validator — see the redaction rules in docs/quizslop-game-mode.md.
 */

export const quizslopTierValidator = v.union(
  v.literal("EASY"),
  v.literal("MEDIUM"),
  v.literal("HARD"),
  v.literal("INSANE"),
);

export const quizslopCategoryValidator = v.union(
  v.literal("SPORTS"),
  v.literal("MUSIC"),
  v.literal("FILM_TV"),
  v.literal("GAMES"),
  v.literal("SCIENCE_NATURE"),
  v.literal("HISTORY"),
  v.literal("GEOGRAPHY"),
  v.literal("FOOD_DRINK"),
  v.literal("BOOKS_LANGUAGE"),
  v.literal("INTERNET_TECH"),
  v.literal("ARTS_CULTURE"),
  v.literal("OTHER"),
);

export const quizslopComedyDeviceValidator = v.union(
  v.literal("UNEXPECTED_SPECIFICITY"),
  v.literal("DRY_ASIDE"),
  v.literal("INCONGRUITY"),
  v.literal("ANTHROPOMORPHISM"),
  v.literal("AFFECTIONATE_ROAST"),
  v.literal("UNDERSTATEMENT"),
  v.literal("WORDPLAY"),
);

export const quizslopPhaseValidator = v.union(
  v.literal("LOBBY_SETUP"),
  v.literal("HOUSE_VOTE"),
  v.literal("HOUSE_VOTE_REVEAL"),
  v.literal("TOPIC_REVEAL"),
  v.literal("SLOP_CALL"),
  v.literal("SLOP_CALL_REVEAL"),
  v.literal("ANSWER"),
  v.literal("QUESTION_REVEAL"),
  v.literal("DISPUTE_WINDOW"),
  v.literal("DISPUTE_VOTE"),
  v.literal("ROUND_RESULTS"),
  v.literal("CONTINUITY_GRACE"),
  v.literal("FINAL_RESULTS"),
  v.literal("ABANDONED"),
);

export const quizslopRoundKindValidator = v.union(
  v.literal("WARM_UP"),
  v.literal("HOME_TURF"),
  v.literal("HOUSE_CHOICE"),
);

export const quizslopTopicSetupStateValidator = v.union(
  v.literal("NEEDS_TOPIC"),
  v.literal("NORMALIZING"),
  v.literal("AWAITING_CONFIRMATION"),
  v.literal("BUILDING"),
  v.literal("READY"),
  v.literal("NEEDS_REVISION"),
  v.literal("NEEDS_FALLBACK"),
);

export const quizslopTopicSourceTypeValidator = v.union(v.literal("CUSTOM"), v.literal("CATALOG"));

export const quizslopDeckRoleValidator = v.union(
  v.literal("WARM_UP"),
  v.literal("HOME_TURF"),
  v.literal("FINALIST"),
);

export const quizslopQuestionRulingValidator = v.union(
  v.literal("UNCHALLENGED_VALID"),
  v.literal("UPHELD"),
  v.literal("PLAYER_VOIDED"),
  v.literal("SYSTEM_VOID"),
);

export const quizslopDisputeReasonValidator = v.union(
  v.literal("WRONG_ANSWER_KEY"),
  v.literal("MULTIPLE_DEFENSIBLE_ANSWERS"),
  v.literal("SOURCE_DOES_NOT_SUPPORT"),
);

export const quizslopDisputeVoteChoiceValidator = v.union(v.literal("UPHOLD"), v.literal("VOID"));

export const quizslopCallOutcomeValidator = v.union(
  v.literal("WON"),
  v.literal("LOST"),
  v.literal("REFUNDED"),
);

export const quizslopOutcomeValidator = v.union(
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
  v.literal("ABANDONED"),
);

export const quizslopEligibilityKindValidator = v.union(
  v.literal("HOUSE_VOTE"),
  v.literal("CALL"),
  v.literal("ANSWER"),
  v.literal("DISPUTE_WINDOW"),
  v.literal("DISPUTE_VOTE"),
);

export const quizslopScoreEventKindValidator = v.union(v.literal("QUIZ"), v.literal("CALL"));

/** Provenance for a frozen game-owned question. */
export const quizslopProvenanceValidator = v.object({
  catalogTopicId: v.union(v.string(), v.null()),
  packVersion: v.number(),
  generatorModelId: v.union(v.string(), v.null()),
  verifierModelId: v.union(v.string(), v.null()),
  promptVersion: v.union(v.string(), v.null()),
  generatedAt: v.union(v.string(), v.null()),
});
