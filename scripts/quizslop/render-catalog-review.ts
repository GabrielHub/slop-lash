/**
 * Renders the reviewed QuizSlop catalog and voice bank into a human-readable
 * markdown artifact for factual + comedy review. Read-only: it never mutates
 * any approval field. Writes output/quizslop-catalog-review.md and prints the
 * path.
 *
 * Usage: vp run quizslop:catalog:review
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { QUIZSLOP_TOPIC_CATALOG } from "../../src/games/quizslop/config/topic-catalog";
import { QUIZSLOP_REJECTED_EXAMPLES } from "../../src/games/quizslop/config/difficulty-examples";
import {
  QUIZSLOP_VOICE_EVENT_TAGS,
  QUIZSLOP_VOICE_LINES,
  getVoiceLinesForTag,
} from "../../src/games/quizslop/config/voice-lines";
import type { QuizslopCatalogTopic } from "../../src/games/quizslop/types";

function renderTopic(topic: QuizslopCatalogTopic): string {
  const lines: string[] = [];
  lines.push(`## ${topic.label}  \`${topic.id}\``);
  lines.push("");
  lines.push(`- Category: **${topic.category}**`);
  lines.push(`- Scope: ${topic.scope}`);
  lines.push(
    `- Exclusions: ${topic.exclusions.length > 0 ? topic.exclusions.map((entry) => `\`${entry}\``).join(", ") : "_none_"}`,
  );
  lines.push(`- Canonical key: \`${topic.canonicalKey}\``);
  lines.push(`- Pack version: ${topic.packVersion} | Retired: ${topic.retired ? "yes" : "no"}`);
  lines.push(
    `- Review: approved=**${topic.review.approved}**, factual=**${topic.review.factualState}**, comedy=**${topic.review.comedyState}**, rating=**${topic.review.comedyRating ?? "none"}**, reviewer=${topic.review.reviewer ?? "none"}`,
  );
  lines.push("");

  for (const question of topic.questions) {
    lines.push(`### [${question.tier}] ${question.id}`);
    lines.push("");
    lines.push(`- Neutral: ${question.neutralQuestion}`);
    lines.push(`- Display: ${question.displayPrompt}`);
    lines.push("- Choices:");
    for (const [index, choice] of question.choices.entries()) {
      const marker = index === question.correctIndex ? " ✅ (key)" : "";
      lines.push(`  ${index + 1}. ${choice}${marker}`);
    }
    lines.push(`- Canonical fact: ${question.canonicalFact}`);
    lines.push(`- Explanation: ${question.explanation}`);
    lines.push(`- Comedy devices: ${question.comedyDevices.join(" > ")}`);
    lines.push("- Sources:");
    for (const source of question.sources) {
      lines.push(
        `  - ${source.primary ? "**[primary]** " : ""}[${source.title}](${source.url}) — locator: ${source.locator}`,
      );
      lines.push(`    - Support: ${source.supportExcerpt}`);
      lines.push(`    - Retrieved: ${source.retrievedAt} | hash: \`${source.contentHash}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderDocument(): string {
  const sections: string[] = [];
  sections.push("# QuizSlop Catalog Review");
  sections.push("");
  sections.push(
    "> Generated read-only view for human factual and comedy review. Approval fields are shown verbatim and are never modified by this script.",
  );
  sections.push("");
  sections.push(
    `Topics: **${QUIZSLOP_TOPIC_CATALOG.length}** | Voice lines: **${QUIZSLOP_VOICE_LINES.length}** | Rejected examples: **${QUIZSLOP_REJECTED_EXAMPLES.length}**`,
  );
  sections.push("");

  sections.push("---");
  sections.push("");
  sections.push("# Topics");
  sections.push("");
  for (const topic of QUIZSLOP_TOPIC_CATALOG) {
    sections.push(renderTopic(topic));
  }

  sections.push("---");
  sections.push("");
  sections.push("# Voice bank");
  sections.push("");
  for (const tag of QUIZSLOP_VOICE_EVENT_TAGS) {
    sections.push(`## ${tag}`);
    sections.push("");
    for (const line of getVoiceLinesForTag(tag)) {
      sections.push(`- \`${line.id}\` approved=**${line.review.approved}**`);
      sections.push(`  - Text: ${line.text}`);
      sections.push(`  - Accessible: ${line.accessibleLabel}`);
    }
    sections.push("");
  }

  sections.push("---");
  sections.push("");
  sections.push("# Rejected boundary examples");
  sections.push("");
  for (const example of QUIZSLOP_REJECTED_EXAMPLES) {
    sections.push(
      `- **${example.reason}**${example.tier ? ` (${example.tier})` : ""} \`${example.id}\``,
    );
    sections.push(`  - ${example.text}`);
    sections.push(`  - Why it fails: ${example.whyItFails}`);
  }
  sections.push("");

  return sections.join("\n");
}

function main(): void {
  const outputDir = path.resolve(process.cwd(), "output");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "quizslop-catalog-review.md");
  writeFileSync(outputPath, renderDocument(), "utf8");
  console.log(`Wrote QuizSlop catalog review to ${outputPath}`);
}

main();
