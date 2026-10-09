import { QUIZSLOP_TOPIC_CATALOG } from "./config/topic-catalog";
import { SHIPPABLE_COMEDY_RATINGS, type QuizslopCatalogTopic } from "./types";

/** Complete production gate shared by offers, selection, materialization, and AI evidence. */
export function isShippableCatalogTopic(topic: QuizslopCatalogTopic): boolean {
  return (
    !topic.retired &&
    topic.review.approved &&
    topic.review.reviewer !== null &&
    topic.review.reviewedAt !== null &&
    topic.review.factualState === "APPROVED" &&
    topic.review.comedyState === "APPROVED" &&
    topic.review.comedyRating !== null &&
    SHIPPABLE_COMEDY_RATINGS.includes(topic.review.comedyRating)
  );
}

/** Shippable catalog topics, minus any already claimed. */
export function availableCatalogTopics(
  claimedIds: ReadonlySet<string> = new Set(),
): QuizslopCatalogTopic[] {
  return QUIZSLOP_TOPIC_CATALOG.filter(
    (topic) => isShippableCatalogTopic(topic) && !claimedIds.has(topic.id),
  );
}
