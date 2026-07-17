/**
 * CLI structural validator for the reviewed QuizSlop catalog and voice bank.
 *
 * Usage (via package.json tasks):
 *   vp run quizslop:catalog:validate            structural checks only
 *   vp run quizslop:catalog:validate-approved   + production approval gate
 *
 * The approval gate is EXPECTED to fail until a human reviewer approves the
 * content; that failure is the product gate, not a crash.
 */
import { collectAllFailures } from "./catalog-checks";
import { QUIZSLOP_TOPIC_CATALOG } from "../../src/games/quizslop/config/topic-catalog";
import { QUIZSLOP_VOICE_LINES } from "../../src/games/quizslop/config/voice-lines";

async function main(): Promise<void> {
  const requireApproved = process.argv.includes("--require-approved");
  const mode = requireApproved ? "structural + approval gate" : "structural";

  const failures = await collectAllFailures(QUIZSLOP_TOPIC_CATALOG, QUIZSLOP_VOICE_LINES, {
    requireApproved,
  });

  if (failures.length === 0) {
    console.log(
      `QuizSlop catalog OK (${mode}): ${QUIZSLOP_TOPIC_CATALOG.length} topics, ${QUIZSLOP_VOICE_LINES.length} voice lines passed.`,
    );
    return;
  }

  if (requireApproved) {
    console.error(
      `QuizSlop catalog approval gate FAILED (${mode}). This is the human review gate: catalog and voice content are still DRAFT and cannot ship until a named human approves them.`,
    );
  } else {
    console.error(`QuizSlop catalog validation FAILED (${mode}).`);
  }
  console.error(`${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exitCode = 1;
}

await main();
