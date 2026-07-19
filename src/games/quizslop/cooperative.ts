import {
  PASS_PERCENT,
  SABOTAGE_OVERRIDE_BONUS,
  SABOTAGE_WRONG_ANSWER_POINTS,
} from "./game-constants";

/**
 * A rotation is a derangement and a bijection: everyone proxies exactly one
 * candidate, everyone receives exactly one proxy, and nobody receives themself.
 */
export function proxySeatForCandidate(
  candidateSeat: number,
  sectionIndex: number,
  playerCount: number,
): number {
  if (!Number.isInteger(playerCount) || playerCount < 2) {
    throw new Error("A proxy rotation needs at least two players");
  }
  const offset = (sectionIndex % (playerCount - 1)) + 1;
  return (candidateSeat + offset) % playerCount;
}

/** Global pack slot; avoids repeats until the frozen topic inventory wraps. */
export function topicIndexForAssignment(
  sectionIndex: number,
  candidateSeat: number,
  playerCount: number,
  topicCount: number,
): number {
  if (topicCount < 1) throw new Error("An exam needs at least one topic");
  return (sectionIndex * playerCount + candidateSeat) % topicCount;
}

export function strictMajorityChoice<T extends string | number>(
  choices: readonly T[],
  eligibleVoterCount: number,
): T | null {
  if (!Number.isInteger(eligibleVoterCount) || eligibleVoterCount < 0) {
    throw new Error("Eligible voter count must be a non-negative integer");
  }
  if (choices.length > eligibleVoterCount) {
    throw new Error("A ballot cannot contain more choices than eligible voters");
  }
  const counts = new Map<T, number>();
  for (const choice of choices) counts.set(choice, (counts.get(choice) ?? 0) + 1);
  for (const [choice, count] of counts) {
    if (count > eligibleVoterCount / 2) return choice;
  }
  return null;
}

function seededIndex(seed: string, choiceCount: number): number {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % choiceCount;
}

/**
 * A group ballot needs a total answer even when discussion produces a split.
 * Strict majority wins; otherwise the candidate's sealed scratch answer is
 * used, with a deterministic seeded choice only when the candidate timed out.
 */
export function resolveGroupAnswer(input: {
  ballots: readonly number[];
  eligibleVoterCount: number;
  candidateScratch: number | null;
  seed: string;
  choiceCount: number;
}): number {
  if (!Number.isInteger(input.choiceCount) || input.choiceCount < 1) {
    throw new Error("A group answer needs at least one choice");
  }
  if (
    input.ballots.some(
      (choice) => !Number.isInteger(choice) || choice < 0 || choice >= input.choiceCount,
    ) ||
    (input.candidateScratch !== null &&
      (!Number.isInteger(input.candidateScratch) ||
        input.candidateScratch < 0 ||
        input.candidateScratch >= input.choiceCount))
  ) {
    throw new Error("A group ballot contains an invalid answer choice");
  }
  const majority = strictMajorityChoice(input.ballots, input.eligibleVoterCount);
  if (majority !== null) return majority;
  if (input.candidateScratch !== null) return input.candidateScratch;
  return seededIndex(input.seed, input.choiceCount);
}

interface CooperativeAnswerSettlement {
  scratchCorrect: boolean;
  officialCorrect: boolean;
  answeredBySaboteur: boolean;
}

export function sabotageForAnswer(answer: CooperativeAnswerSettlement): number {
  if (!answer.answeredBySaboteur || answer.officialCorrect) return 0;
  return SABOTAGE_WRONG_ANSWER_POINTS + (answer.scratchCorrect ? SABOTAGE_OVERRIDE_BONUS : 0);
}

interface FinalExamResult {
  rawCorrect: number;
  attempted: number;
  sabotagePoints: number;
  saboteurIdentified: boolean;
}

export function finalExamScore(result: FinalExamResult): {
  adjustedCorrect: number;
  gradePercent: number;
  passed: boolean;
  sabotageDeduction: number;
} {
  const sabotageDeduction = result.saboteurIdentified ? 0 : Math.max(0, result.sabotagePoints);
  const adjustedCorrect = Math.max(0, result.rawCorrect - sabotageDeduction);
  const gradePercent = result.attempted === 0 ? 0 : (adjustedCorrect / result.attempted) * 100;
  return {
    adjustedCorrect,
    gradePercent,
    passed: gradePercent >= PASS_PERCENT,
    sabotageDeduction,
  };
}
