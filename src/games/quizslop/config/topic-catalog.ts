/**
 * Reviewed QuizSlop topic catalog. Authored content for the party-trivia mode;
 * see docs/quizslop-game-mode.md ("Reviewed topic catalog", "Question Content
 * Contract"). Every fact carries retained source evidence.
 *
 * Canonical keys and source hashes are frozen digests. Catalog tasks re-derive
 * them and fail on mismatch. Human factual/comedy approval remains an explicit
 * product gate; implementation agents must never mark draft content approved.
 */
import type { QuizslopCatalogTopic } from "../types";
import { QUIZSLOP_ADDITIONS_TOPICS } from "./topic-catalog-additions";
import { QUIZSLOP_CULTURE_HISTORY_TOPICS } from "./topic-catalog-culture-history";
import { QUIZSLOP_FLAGS_FILM_TOPICS } from "./topic-catalog-flags-film";
import { QUIZSLOP_HISTORY_LIFESTYLE_TOPICS } from "./topic-catalog-history-lifestyle";
import { QUIZSLOP_SCIENCE_GEOGRAPHY_TOPICS } from "./topic-catalog-science-geography";

/** Stable ordering is part of deterministic offer/deck selection. */
export const QUIZSLOP_TOPIC_CATALOG: readonly QuizslopCatalogTopic[] = [
  ...QUIZSLOP_SCIENCE_GEOGRAPHY_TOPICS,
  ...QUIZSLOP_FLAGS_FILM_TOPICS,
  ...QUIZSLOP_CULTURE_HISTORY_TOPICS,
  ...QUIZSLOP_HISTORY_LIFESTYLE_TOPICS,
  ...QUIZSLOP_ADDITIONS_TOPICS,
];
