"use node";

import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getAiProviderKeys } from "../aiGateway";
import type { AiCallRow } from "../jobs";
import { aiCallUsageValidator, aiFailReasonValidator } from "../validators";
import { ARENA_IDS } from "../../src/games/slopfight/arenas";
import { parsePartialParts, type Part } from "../../src/games/slopfight/sheet";
import { materialInkPatches, strokesByLayer, type InkPatch } from "../../src/games/slopfight/strokes";
import { BODY_PLANS, type BodyPlan } from "../../src/games/slopfight/vocab";
import type { ForgeInput } from "./forgeData";
import { forgeChampion, renderDoodlePng, type ForgeChampionOptions, type ForgeMode } from "./ports";
import { forgeOutcomeValidator, type ForgeKind } from "./tables";

// The Node half of the forge: rasterize the stored strokes (the PNG lives only
// in this action), stream the champion from the model, patch the growing parts
// in at most four times a second, then land the result through a guarded
// mutation. A newer submit's token makes all of it a no-op.

/** Streamed part patches: at most one per this many milliseconds (4 Hz). */
export const PARTIAL_PATCH_MS = 250;

type ForgeOutcome = Infer<typeof forgeOutcomeValidator>;

/** Which wrapper mode each backend forge uses. */
const WRAPPER_MODE: Record<ForgeKind, ForgeMode> = {
  SUBMIT: "submit",
  LENIENT: "lenient",
  // Every upgrade is an upgrade call on the current sheet: the player's
  // addition, what they had drawn when the clock ran out, or the house's
  // addition picked in code. An upgrade with nothing added never calls.
  UPGRADE: "upgrade",
  LENIENT_UPGRADE: "upgrade",
  HOUSE: "house",
  HOUSE_UPGRADE: "upgrade",
};

/** Where the forged layer's material inks show: the whole Build drawing, or an upgrade's new strokes. */
function forgedInks(batches: NonNullable<ForgeInput["batches"]>, layer: number): InkPatch[] {
  const strokes = strokesByLayer(batches).find((group) => group.layer === layer)?.strokes ?? [];
  return materialInkPatches(strokes);
}

/** The wrapper's options for one stored forge input. */
export function forgeOptions(input: ForgeInput): Omit<ForgeChampionOptions, "keys" | "onPartial"> {
  return {
    mode: WRAPPER_MODE[input.kind],
    arenas: input.arenas,
    deadline: null,
    ...(input.text ? { text: input.text } : {}),
    ...(input.batches
      ? { png: renderDoodlePng(input.batches, input.layer), inks: forgedInks(input.batches, input.layer) }
      : {}),
    ...(input.previous ? { previous: input.previous } : {}),
    ...(input.addition ? { addition: input.addition } : {}),
  };
}

/** The body plan a partial result has streamed so far (it comes before the parts), or null. */
export function partialBodyPlan(partial: unknown): BodyPlan | null {
  if (typeof partial !== "object" || partial === null) return null;
  const record = partial as Record<string, unknown>;
  if ("champion" in record) return partialBodyPlan(record.champion ?? null);
  const plan = record.bodyPlan;
  return typeof plan === "string" && (BODY_PLANS as readonly string[]).includes(plan)
    ? (plan as BodyPlan)
    : null;
}

/**
 * Coalesces streamed partial results into part patches: only when the valid
 * prefix grew, at most every PARTIAL_PATCH_MS, with a trailing flush, in order.
 * Each patch carries the body plan streamed so far, if any.
 */
function partialPatcher(
  send: (parts: Part[], restart: boolean, plan: BodyPlan | null) => Promise<unknown>,
) {
  let plan: BodyPlan | null = null;
  let attempt = 0;
  let restart = false;
  let sentCount = 0;
  let lastSentAt = 0;
  let pending: Part[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const flush = () => {
    timer = null;
    if (!pending || pending.length <= sentCount) return;
    const parts = pending;
    const fresh = restart;
    pending = null;
    restart = false;
    sentCount = parts.length;
    lastSentAt = Date.now();
    const sentPlan = plan;
    chain = chain
      .then(() => send(parts, fresh, sentPlan))
      .catch((error) => console.warn("[forge] partial", error));
  };

  return {
    onPartial: (partial: unknown, info?: { attempt: number }) => {
      // A repair or fallback call streams from scratch: the pedestal regrows.
      if (info && info.attempt !== attempt) {
        attempt = info.attempt;
        restart = true;
        sentCount = 0;
        pending = null;
      }
      plan = partialBodyPlan(partial) ?? plan;
      const parts = parsePartialParts(partial);
      if (parts.length <= Math.max(sentCount, pending?.length ?? 0)) return;
      pending = parts;
      const wait = lastSentAt + PARTIAL_PATCH_MS - Date.now();
      if (wait <= 0) flush();
      else timer ??= setTimeout(flush, wait);
    },
    /** Stops the trailing flush and waits for patches already sent. */
    async close() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      await chain;
    },
  };
}

export const run = internalAction({
  args: { fighterId: v.id("slopFightFighters"), forgeToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const input: ForgeInput | null = await ctx.runQuery(
      internal.slopfight.forgeData.forgeInput,
      args,
    );
    if (!input) return null;
    const patcher = partialPatcher((parts, restart, plan) =>
      ctx.runMutation(internal.slopfight.forgeData.patchPartial, {
        ...args,
        parts,
        restart,
        ...(plan ? { bodyPlan: plan } : {}),
      }),
    );
    let calls: AiCallRow[] = [];
    let outcome: ForgeOutcome;
    try {
      const result = await forgeChampion({
        ...forgeOptions(input),
        keys: getAiProviderKeys(),
        onPartial: patcher.onPartial,
      });
      calls = result.calls;
      outcome = toOutcome(result);
    } catch (error) {
      console.error("[forge] action failed", error);
      outcome = { kind: "FAILED", failReason: "action-error" };
    }
    await patcher.close();
    await ctx.runMutation(internal.slopfight.forgeData.applyForge, { ...args, outcome, calls });
    return null;
  },
});

function toOutcome(result: Awaited<ReturnType<typeof forgeChampion>>): ForgeOutcome {
  if (!result.ok) return { kind: "FAILED", failReason: result.failReason };
  const { verdict, champion, rejection } = result.result;
  if (verdict === "FORGE" && champion) return { kind: "FORGE", champion };
  if (verdict === "REJECT" && rejection) return { kind: "REJECT", ...rejection };
  return { kind: "FAILED", failReason: "invalid-output" };
}

/**
 * Dev smoke test: one real forge of a short description, nothing stored.
 * `vp exec convex run slopfight/forge:smoke '{"text":"..."}'` on the dev deployment.
 */
export const smoke = internalAction({
  args: { text: v.string() },
  returns: v.object({
    latencyMs: v.number(),
    firstPartMs: v.union(v.number(), v.null()),
    streamedParts: v.number(),
    outcome: forgeOutcomeValidator,
    calls: v.array(
      v.object({
        modelId: v.string(),
        ok: v.boolean(),
        failReason: v.union(aiFailReasonValidator, v.null()),
        latencyMs: v.number(),
        usage: aiCallUsageValidator,
      }),
    ),
  }),
  handler: async (_ctx, args) => {
    const started = Date.now();
    let firstPartAt: number | null = null;
    let parts = 0;
    const result = await forgeChampion({
      mode: "submit",
      text: args.text,
      arenas: [...ARENA_IDS],
      keys: getAiProviderKeys(),
      deadline: null,
      onPartial(partial) {
        const count = parsePartialParts(partial).length;
        if (count > 0 && firstPartAt === null) firstPartAt = Date.now();
        parts = Math.max(parts, count);
      },
    });
    return {
      latencyMs: Date.now() - started,
      firstPartMs: firstPartAt === null ? null : firstPartAt - started,
      streamedParts: parts,
      outcome: toOutcome(result),
      calls: result.calls.map((call) => ({
        modelId: call.modelId,
        ok: call.ok,
        failReason: call.failReason,
        latencyMs: call.latencyMs,
        usage: call.usage,
      })),
    };
  },
});
