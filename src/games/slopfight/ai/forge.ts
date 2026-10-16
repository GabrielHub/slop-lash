import { Output, type DeepPartial } from "ai";
import { runStructuredStream, type AiCallRecord, type AiRunResult } from "@/lib/ai/run";
import { decodeXmlEntities } from "@/lib/ai/xml";
import type { ArenaId } from "../arenas";
import {
  balanceChampion,
  forgeResultProblems,
  legCount,
  normalizeRejection,
  type Champion,
  type ForgeResult,
  type Rejection,
  type SheetProblem,
} from "../sheet";
import { BODY_PLAN_LEGS, planForLegs } from "./body-plan";
import { FORGE_SCHEMA } from "./forge-schema";
import { preserveUpgrade, preserveUpgradePartial } from "./upgrade";
import {
  FORGE_PROMPT_VERSION,
  forgeInstructions,
  forgeMessages,
  forgeRepairMessages,
  type ForgeInput,
  type ForgeMode,
} from "./forge-prompt";
import { BIO_MAX, NARRATION_LINE_MAX, REJECTION_TEXT_MAX } from "../constants";
import type { InkPatch } from "../strokes";
import {
  callSettings,
  modelText,
  SLOPFIGHT_FALLBACK_MODEL_ID,
  SLOPFIGHT_MODEL_ID,
  type AiOutcome,
  type CallOptions,
} from "./shared";

export type { ForgeMode } from "./forge-prompt";
export { BODY_PLAN_LEGS, planForLegs } from "./body-plan";

/**
 * One schema object for every forge call (Haiku, its repair, the Sonnet
 * fallback): providers cache the schema with the prompt prefix. It is the
 * contract's ForgeResultSchema with descriptions that leave sums and lengths
 * to code (`forge-schema.ts`).
 */
export const FORGE_OUTPUT = Output.object({ schema: FORGE_SCHEMA });

export type ForgePartial = DeepPartial<ForgeResult>;

/** Which call a partial came from. Each call streams from scratch, so growth restarts on a new attempt. */
export interface ForgeStreamInfo {
  /** 0 for the first call, then 1, 2 for the repair or fallback calls that follow. */
  attempt: number;
  stage: "forge" | "repair" | "fallback";
  modelId: string;
}

export interface ForgeChampionOptions extends CallOptions {
  mode: ForgeMode;
  /** The description (submit, lenient, house). */
  text?: string;
  /** The rasterized doodle as PNG bytes (`renderDoodlePng`); never stored. */
  png?: Uint8Array;
  /** Upgrade: the champion as it is now. */
  previous?: Champion;
  /** Upgrade: the added text (an added drawing comes in `png`, faded layers under the new one). */
  addition?: string;
  /** Where the drawing's material inks show (`materialInkPatches`; an upgrade: its new layer's). */
  inks?: readonly InkPatch[];
  arenas: readonly ArenaId[];
  /** Each partial ForgeResult as it streams; throttle on your side. Errors it throws are logged and ignored. */
  onPartial?: (partial: ForgePartial, info: ForgeStreamInfo) => void;
}

export type ForgeChampionResult = AiOutcome<{ result: ForgeResult }>;

/** The REJECT a player sees when the model's safeguards decline their submission. */
export const REFUSAL_REJECTION: Rejection = {
  reason: "The Foundry wouldn't touch that one. It has standards, apparently.",
  suggestion: "Try a different creature: something silly works best.",
};

const mustForge = (mode: ForgeMode) => mode === "lenient" || mode === "house";

export interface ForgeReplyProblem extends Omit<SheetProblem, "code"> {
  code: SheetProblem["code"] | "must_forge" | "body_plan_legs";
}

function legRange([min, max]: readonly [number, number]): string {
  return min === max ? `exactly ${min}` : `${min} to ${max}`;
}

/**
 * Problems in the raw reply worth a repair: structural ones, a REJECT where
 * one is not allowed, and a body plan its legs contradict (a one-legged
 * BIPED). Checked before balancing, which would hide all of them.
 */
export function replyProblems(mode: ForgeMode, raw: ForgeResult): ForgeReplyProblem[] {
  if (mustForge(mode) && raw.verdict === "REJECT") {
    return [
      {
        code: "must_forge",
        message: `This is a ${mode} forge, which must FORGE a champion and never REJECT; follow the ${mode} rules.`,
      },
    ];
  }
  const problems: ForgeReplyProblem[] = forgeResultProblems(raw);
  if (problems.length > 0 || raw.champion === null) return problems;
  // Counted as the game will build it: paired limb anchors never mirror.
  const legs = legCount(balanceChampion(raw.champion));
  const plan = raw.champion.bodyPlan;
  const range = BODY_PLAN_LEGS[plan];
  if (legs < range[0] || legs > range[1]) {
    problems.push({
      code: "body_plan_legs",
      message: `The body plan is ${plan}, which has ${legRange(range)} legs, but the parts have ${legs} (one leg part per leg, mirror false). Fix the legs or the plan to match what the submission shows.`,
    });
  }
  return problems;
}

function decodeChampion(champion: Champion): Champion {
  const decode = (text: string) => decodeXmlEntities(text);
  const narration = Object.fromEntries(
    Object.entries(champion.narration).map(([key, lines]) => [
      key,
      lines.map((line) => modelText(line, NARRATION_LINE_MAX)),
    ]),
  ) as Champion["narration"];
  return {
    ...champion,
    name: decode(champion.name),
    bio: modelText(champion.bio, BIO_MAX),
    moves: champion.moves.map((move) => ({ ...move, name: decode(move.name) })),
    narration,
  };
}

/**
 * An item part hung on the torso (a deck of cards stuck to the chest) moves
 * to the grip the prompt asks for: the end of arm2 (or of the last arm, or of
 * the claw or fist on it), or the mouth (head.bottom) of a body without arms.
 * Haiku does this when it answers without thinking. An item with parts of its
 * own stays put; one moved item goes last, after its new parent.
 */
export function seatItem(champion: Champion): Champion {
  const torso = champion.parts.find((part) => part.role === "torso");
  const loose = champion.parts.find(
    (part) =>
      part.role === "item" &&
      part.parent === torso?.id &&
      !champion.parts.some((child) => child.parent === part.id),
  );
  if (!torso || !loose) return champion;
  const arms = champion.parts.filter((part) => part.role === "arm" && part.parent === torso.id);
  const arm = arms.find((part) => part.anchor === "arm2") ?? arms.at(-1);
  const hand = arm && champion.parts.find((part) => part.role === "arm" && part.parent === arm.id && part.anchor === "bottom");
  const necks = new Set(champion.parts.filter((part) => part.role === "head").map((part) => part.parent));
  const mouth = champion.parts.find((part) => part.role === "head" && !necks.has(part.id));
  const grip = hand ?? arm ?? mouth;
  if (!grip) return champion;
  const seated = { ...loose, parent: grip.id, anchor: "bottom" as const };
  return { ...champion, parts: [...champion.parts.filter((part) => part !== loose), seated] };
}

/**
 * A result the game can trust: a balanced champion, or a cleaned rejection.
 * A body plan its legs contradict (only the unrepaired Sonnet fallback can
 * still have one) takes the plan the leg count implies, and an item on the
 * torso moves to a hand or the mouth (`seatItem`).
 */
export function finishForgeResult(raw: ForgeResult): ForgeResult {
  if (raw.verdict === "REJECT" || raw.champion === null) {
    // normalizeRejection fills an empty reason or suggestion with a kind default.
    const rejection = raw.rejection ?? { reason: "", suggestion: "" };
    return {
      verdict: "REJECT",
      rejection: normalizeRejection({
        reason: modelText(rejection.reason, REJECTION_TEXT_MAX),
        suggestion: modelText(rejection.suggestion, REJECTION_TEXT_MAX),
      }),
      champion: null,
    };
  }
  const champion = seatItem(balanceChampion(decodeChampion(raw.champion)));
  const bodyPlan = planForLegs(champion.bodyPlan, legCount(champion));
  const markings = champion.markings ?? [];
  return { verdict: "FORGE", rejection: null, champion: { ...champion, bodyPlan, markings } };
}

const rejected = (calls: AiCallRecord[]): ForgeChampionResult => ({
  ok: true,
  result: { verdict: "REJECT", rejection: normalizeRejection(REFUSAL_REJECTION), champion: null },
  calls,
});

/**
 * Forges one champion: Haiku 5.5 at high effort, streamed. The raw reply is
 * checked for structural problems (and for a REJECT in a lenient or house
 * forge); any problem gets one Haiku repair call, and a repair that still
 * fails, or a Haiku call that fails outright, goes to Sonnet 5.5 at medium.
 * A Haiku refusal on a player's submit or upgrade comes back as a kind
 * REJECT (the same input would be refused again), not a Sonnet retry; on a
 * lenient or house forge it goes to Sonnet. The champion is balanced before
 * it is returned. An upgrade keeps everything the champion already had
 * (`preserveUpgrade`), in its streamed partials too. Never throws for a model
 * or provider problem.
 */
export async function forgeChampion(options: ForgeChampionOptions): Promise<ForgeChampionResult> {
  const { mode } = options;
  const input: ForgeInput = {
    mode,
    text: options.text,
    png: options.png,
    previous: options.previous,
    addition: options.addition,
    inks: options.inks,
  };
  const instructions = forgeInstructions(mode, options.arenas);
  const calls: AiCallRecord[] = [];
  let attempt = 0;
  // An upgrade carries the champion over in code: the model only adds.
  const previous = mode === "upgrade" ? options.previous : undefined;
  const additionText = options.addition ?? options.text ?? "";
  // Material ink on the new layer may give any existing part its finish.
  const inkFinishes = [...new Set((options.inks ?? []).map((patch) => patch.ink.finish))];
  const finish = (raw: ForgeResult): ForgeResult => {
    const result = finishForgeResult(raw);
    if (!previous || !result.champion) return result;
    const champion = preserveUpgrade(previous, result.champion, additionText, inkFinishes);
    return { ...result, champion: { ...champion, markings: champion.markings ?? [] } };
  };

  const run = async (
    stage: ForgeStreamInfo["stage"],
    messages: ReturnType<typeof forgeMessages>,
  ): Promise<AiRunResult<ForgeResult>> => {
    const modelId = stage === "fallback" ? SLOPFIGHT_FALLBACK_MODEL_ID : SLOPFIGHT_MODEL_ID;
    const info: ForgeStreamInfo = { attempt: attempt++, stage, modelId };
    const result = await runStructuredStream(
      stage === "fallback" ? "slopfight.forgeFallback" : "slopfight.forge",
      {
        ...callSettings(options, modelId),
        promptVersion: FORGE_PROMPT_VERSION,
        instructions,
        messages,
        output: FORGE_OUTPUT,
        onPartial: (partial) =>
          options.onPartial?.(
            previous
              ? preserveUpgradePartial(previous, partial as ForgePartial, additionText, inkFinishes)
              : (partial as ForgePartial),
            info,
          ),
      },
    );
    calls.push(result.call);
    return result;
  };

  const first = await run("forge", forgeMessages(input));
  if (first.ok) {
    const problems = replyProblems(mode, first.output);
    if (problems.length === 0) return { ok: true, result: finish(first.output), calls };
    const repair = await run(
      "repair",
      forgeRepairMessages(input, JSON.stringify(first.output), problems),
    );
    if (repair.ok && replyProblems(mode, repair.output).length === 0) {
      return { ok: true, result: finish(repair.output), calls };
    }
    if (!repair.ok && repair.failReason === "aborted") return { ok: false, failReason: "aborted", calls };
    if (!repair.ok && repair.failReason === "refused" && !mustForge(mode)) return rejected(calls);
  } else {
    if (first.failReason === "aborted") return { ok: false, failReason: "aborted", calls };
    if (first.failReason === "refused" && !mustForge(mode)) return rejected(calls);
  }

  const fallback = await run("fallback", forgeMessages(input));
  if (!fallback.ok) {
    if (fallback.failReason === "refused" && !mustForge(mode)) return rejected(calls);
    return { ok: false, failReason: fallback.failReason, calls };
  }
  // The last model: balancing repairs whatever structure is left, but a
  // lenient or house forge must still have forged.
  const raw = fallback.output;
  if (raw.verdict === "FORGE" ? raw.champion === null : mustForge(mode)) {
    return { ok: false, failReason: "invalid-output", calls };
  }
  return { ok: true, result: finish(raw), calls };
}
