import { QUIZSLOP_TOPIC_CATALOG } from "./config/topic-catalog";
import type { QuizslopCatalogTopic } from "./types";

/** Catalog topics still selectable after excluding every claimed identity. */
export function availableCatalogTopics(claimed: {
  canonicalKeys: ReadonlySet<string>;
  catalogTopicIds: ReadonlySet<string>;
}): QuizslopCatalogTopic[] {
  return QUIZSLOP_TOPIC_CATALOG.filter(
    (topic) =>
      !topic.retired &&
      !claimed.canonicalKeys.has(topic.canonicalKey) &&
      !claimed.catalogTopicIds.has(topic.id),
  );
}
