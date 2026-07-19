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
  v.literal("SECTION_INTRO"),
  v.literal("SCRATCH"),
  v.literal("PROXY_ANSWER"),
  v.literal("ORAL_DEFENSE"),
  v.literal("SECTION_RESULTS"),
  v.literal("PROCTOR_REVIEW_VOTE"),
  v.literal("PROCTOR_REVIEW_RESULT"),
  v.literal("FINAL_ACCUSATION"),
  v.literal("FINAL_RESULTS"),
);

export const quizslopRoleValidator = v.union(v.literal("CREW"), v.literal("SABOTEUR"));

export const quizslopAnswerAuthorityValidator = v.union(v.literal("PROXY"), v.literal("GROUP"));

export const quizslopContentSourceValidator = v.union(v.literal("CATALOG"), v.literal("AI"));

export const quizslopPackStatusValidator = v.union(
  v.literal("CATALOG_READY"),
  v.literal("PENDING"),
  v.literal("GENERATING"),
  v.literal("READY"),
  v.literal("FALLBACK"),
  v.literal("FAILED"),
);

export const quizslopDefenseKindValidator = v.union(v.literal("CANDIDATE"), v.literal("PROXY"));

/** Provenance for a frozen game-owned question. */
export const quizslopProvenanceValidator = v.object({
  catalogTopicId: v.union(v.string(), v.null()),
  packVersion: v.number(),
  generatorModelId: v.union(v.string(), v.null()),
  verifierModelId: v.union(v.string(), v.null()),
  promptVersion: v.union(v.string(), v.null()),
  generatedAt: v.union(v.string(), v.null()),
});
