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

/** Catalog topics still selectable after excluding every claimed identity. */
export function availableCatalogTopics(claimed: {
  canonicalKeys: ReadonlySet<string>;
  catalogTopicIds: ReadonlySet<string>;
}): QuizslopCatalogTopic[] {
  return QUIZSLOP_TOPIC_CATALOG.filter(
    (topic) =>
      isShippableCatalogTopic(topic) &&
      !claimed.canonicalKeys.has(topic.canonicalKey) &&
      !claimed.catalogTopicIds.has(topic.id),
  );
}
