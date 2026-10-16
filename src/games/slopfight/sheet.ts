// The champion sheet: the forge model's structured output, plus the code that
// turns whatever the model wrote into a sheet the game can trust.
//
// The zod schemas below are MODEL-FACING. Anthropic structured outputs enforce
// types, enums, nullability and property order, but not numeric ranges, string
// lengths or array counts, and the AI SDK validates the final output against
// the full zod schema. So the schemas only use what the decoder enforces
// (integers in range are enums), describe every other limit in text, and
// balanceChampion() enforces those limits in code. Property order is the
// streaming order: parts arrive before the name card.

import { z } from "zod";
import { fitText } from "../../lib/fit-text";
import { stableHash } from "../../lib/hash";
import { sanitize } from "../../lib/sanitize";
import {
  BIO_MAX,
  HEALTH_BASE,
  HEALTH_PER_HEFT,
  MARKINGS_MAX,
  MIN_MOVE_TYPES,
  MOVE_COUNT,
  MOVE_NAME_MAX,
  NAME_MAX,
  NARRATION_LINE_MAX,
  PART_ID_MAX,
  PARTS_MAX,
  POWER_MAX,
  POWER_MIN,
  POWER_SUM,
  REJECTION_TEXT_MAX,
  STAT_MAX,
  STAT_MIN,
  STAT_SUM,
  TRAITS_MAX,
  TRAITS_MIN,
} from "./constants";
import {
  ANCHORS,
  ARM_ANCHORS,
  BODY_PLAN_INFO,
  BODY_PLANS,
  CONFLICTING_TRAITS,
  DELIVERIES,
  ELONGATIONS,
  EYE_STYLES,
  FINISHES,
  LEG_ANCHORS,
  MARKING_KINDS,
  MOUTH_STYLES,
  MOVE_TYPES,
  NEUTRAL_TRAITS,
  PART_COLORS,
  PART_ROLES,
  PART_SHAPES,
  PART_SIZES,
  PROP_TAGS,
  TOY_COLORS,
  TRAITS,
  type Anchor,
  type Delivery,
  type MoveType,
  type PartRole,
  type Trait,
} from "./vocab";

// ---------------------------------------------------------------------------
// Schemas (model-facing)
// ---------------------------------------------------------------------------

export const PIPS = [1, 2, 3, 4, 5] as const;
/** A 1-5 stat or move power. An enum, so the decoder keeps it in range. */
export type Pip = (typeof PIPS)[number];
const PipSchema = z.literal(PIPS);

export const BodyPlanSchema = z.enum(BODY_PLANS);
export const ToyColorSchema = z.enum(TOY_COLORS);
export const TraitSchema = z.enum(TRAITS);
export const PropTagSchema = z.enum(PROP_TAGS);
export const AnchorSchema = z.enum(ANCHORS);

export const PartSchema = z.object({
  id: z
    .string()
    .describe(`Short unique id, at most ${PART_ID_MAX} characters, like "torso", "head", "leg1"`),
  role: z.enum(PART_ROLES),
  shape: z.enum(PART_SHAPES),
  size: z.enum(PART_SIZES),
  elongation: z.enum(ELONGATIONS),
  parent: z
    .string()
    .nullable()
    .describe("Id of an earlier part this one attaches to. Null only for the torso"),
  anchor: AnchorSchema.nullable().describe(
    "Where on the parent it attaches. Null only for the torso. Legs use leg1..leg8 and arms arm1..arm4 (odd left, even right, front to back)",
  ),
  color: z.enum(PART_COLORS),
  /** What it is made of; absent means vinyl (normalizePart drops "vinyl"). */
  finish: z.enum(FINISHES).optional(),
  mirror: z
    .boolean()
    .describe("True adds a mirrored copy across the midline. False on legN and armN anchors"),
});

export const MoveSchema = z.object({
  name: z.string().describe(`Move name, at most ${MOVE_NAME_MAX} characters`),
  type: z.enum(MOVE_TYPES),
  power: PipSchema.describe(`1-5; a champion's three powers sum to ${POWER_SUM}`),
  delivery: z.enum(DELIVERIES),
});

export const MarkingSchema = z.object({
  part: z.string().describe("Id of the part the marking is painted on"),
  kind: z.enum(MARKING_KINDS),
  color: z.enum(PART_COLORS).describe("Palette slot of the paint; never the part's own colour"),
});

const lines = (count: number, what: string) =>
  z
    .array(z.string())
    .describe(`Exactly ${count} lines ${what}, each at most ${NARRATION_LINE_MAX} characters`);

export const NarrationSchema = z.object({
  walkOn: lines(2, "for its walk-on"),
  landHit: lines(3, "for when it lands a hit"),
  takeHit: lines(2, "for when it takes a hit"),
  win: lines(2, "for when it wins"),
  lose: lines(2, "for when it loses"),
  ringOut: lines(2, "for when it is rung out"),
});

export const ChampionSchema = z.object({
  bodyPlan: BodyPlanSchema,
  palette: z.object({
    primary: ToyColorSchema,
    secondary: ToyColorSchema,
    accent: ToyColorSchema,
  }),
  parts: z
    .array(PartSchema)
    .describe(
      `1-${PARTS_MAX} parts: exactly one torso first, then head, legs, arms, extras. Every part after the torso names an earlier part as its parent`,
    ),
  markings: z
    .array(MarkingSchema)
    .optional()
    .describe(
      `Painted patterns: 0-${MARKINGS_MAX}, at most one per part, never in the part's own colour`,
    ),
  face: z.object({ eyes: z.enum(EYE_STYLES), mouth: z.enum(MOUTH_STYLES) }),
  item: PropTagSchema.nullable().describe("The held item, or null. An item part marks the grip"),
  stats: z
    .object({ heft: PipSchema, reach: PipSchema, chaos: PipSchema })
    .describe(`Each 1-5, summing to ${STAT_SUM}`),
  moves: z
    .array(MoveSchema)
    .describe(`Exactly ${MOVE_COUNT} moves covering at least ${MIN_MOVE_TYPES} types`),
  traits: z.array(TraitSchema).describe(`${TRAITS_MIN}-${TRAITS_MAX} different traits`),
  temperament: z
    .object({ aggression: z.number(), caution: z.number(), showboating: z.number() })
    .describe("Each between 0 and 1"),
  name: z.string().describe(`At most ${NAME_MAX} characters`),
  bio: z.string().describe(`One line, at most ${BIO_MAX} characters`),
  narration: NarrationSchema,
});

export const RejectionSchema = z.object({
  reason: z.string().describe(`A kind one-liner, at most ${REJECTION_TEXT_MAX} characters`),
  suggestion: z.string().describe(`What to try instead, at most ${REJECTION_TEXT_MAX} characters`),
});

/**
 * The champion as the model writes it: markings are required, so the model
 * weighs them every time and writes [] when there are none (and the decoder
 * never has to handle an optional property). Re-declaring the key keeps its
 * place right after the parts.
 */
export const ForgeChampionSchema = ChampionSchema.extend({
  markings: z
    .array(MarkingSchema)
    .describe(`0-${MARKINGS_MAX} painted markings, at most one per part; [] when none`),
});

export const ForgeResultSchema = z.object({
  verdict: z.enum(["FORGE", "REJECT"]),
  rejection: RejectionSchema.nullable().describe("Null exactly when the verdict is FORGE"),
  champion: ForgeChampionSchema.nullable().describe("Null exactly when the verdict is REJECT"),
});

export type Part = z.infer<typeof PartSchema>;
export type Marking = z.infer<typeof MarkingSchema>;
export type Move = z.infer<typeof MoveSchema>;
export type Narration = z.infer<typeof NarrationSchema>;
export type Champion = z.infer<typeof ChampionSchema>;
export type Rejection = z.infer<typeof RejectionSchema>;
export type ForgeResult = z.infer<typeof ForgeResultSchema>;
export type Stats = Champion["stats"];
export type Temperament = Champion["temperament"];
export type Palette = Champion["palette"];
export type Face = Champion["face"];

export type {
  Anchor,
  BodyPlan,
  Delivery,
  Elongation,
  EyeStyle,
  Finish,
  MarkingKind,
  MouthStyle,
  MoveType,
  PartColor,
  PartRole,
  PartShape,
  PartSize,
  PropTag,
  ToyColor,
  Trait,
} from "./vocab";

export const NARRATION_COUNTS = {
  walkOn: 2,
  landHit: 3,
  takeHit: 2,
  win: 2,
  lose: 2,
  ringOut: 2,
} as const satisfies Record<keyof Narration, number>;

// ---------------------------------------------------------------------------
// Validation (what the one repair call is told about)
// ---------------------------------------------------------------------------

export type SheetProblemCode =
  | "missing_champion"
  | "missing_rejection"
  | "no_torso"
  | "multiple_torsos"
  | "too_many_parts"
  | "empty_id"
  | "duplicate_id"
  | "torso_has_parent"
  | "missing_parent"
  | "unknown_parent"
  | "missing_anchor"
  | "cycle"
  | "too_few_moves";

export interface SheetProblem {
  code: SheetProblemCode;
  /** One sentence the repair prompt can quote back to the model. */
  message: string;
  partId?: string;
}

/**
 * Structural problems balanceChampion would have to fix by dropping or
 * inventing things. An empty list means the sheet only needs balancing.
 */
export function validateChampion(champion: Champion): SheetProblem[] {
  const problems: SheetProblem[] = [];
  const parts = champion.parts;
  const torsos = parts.filter((part) => part.role === "torso");

  if (torsos.length === 0) {
    problems.push({ code: "no_torso", message: "The parts list needs exactly one torso." });
  } else if (torsos.length > 1) {
    problems.push({
      code: "multiple_torsos",
      message: `There are ${torsos.length} torsos (${torsos.map((part) => `"${part.id}"`).join(", ")}); keep exactly one.`,
    });
  }
  if (parts.length > PARTS_MAX) {
    problems.push({
      code: "too_many_parts",
      message: `There are ${parts.length} parts; the limit is ${PARTS_MAX}.`,
    });
  }

  const byId = new Map<string, Part>();
  for (const part of parts) {
    const id = normalizePartId(part.id);
    if (!id) {
      problems.push({ code: "empty_id", message: `A ${part.role} part has an empty id.` });
    } else if (byId.has(id)) {
      problems.push({
        code: "duplicate_id",
        partId: id,
        message: `Two parts share the id "${id}"; ids must be unique.`,
      });
    } else {
      byId.set(id, part);
    }
  }

  for (const part of parts) {
    const id = normalizePartId(part.id);
    const parent = part.parent === null ? null : normalizePartId(part.parent);
    if (part.role === "torso") {
      if (parent !== null || part.anchor !== null) {
        problems.push({
          code: "torso_has_parent",
          partId: id,
          message: `The torso "${id}" must have a null parent and a null anchor.`,
        });
      }
      continue;
    }
    if (parent === null || parent === "") {
      problems.push({
        code: "missing_parent",
        partId: id,
        message: `Part "${id}" (${part.role}) has no parent; every part but the torso needs one.`,
      });
    } else if (!byId.has(parent)) {
      problems.push({
        code: "unknown_parent",
        partId: id,
        message: `Part "${id}" names parent "${parent}", which is not a part id.`,
      });
    }
    if (part.anchor === null) {
      problems.push({
        code: "missing_anchor",
        partId: id,
        message: `Part "${id}" has no anchor on its parent.`,
      });
    }
  }

  const inCycle = new Set<string>();
  for (const start of byId.keys()) {
    if (inCycle.has(start)) continue;
    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | null = start;
    while (current !== null && byId.has(current) && !onPath.has(current)) {
      path.push(current);
      onPath.add(current);
      const parent: string | null = byId.get(current)!.parent;
      current = parent === null ? null : normalizePartId(parent);
    }
    if (current !== null && onPath.has(current)) {
      const loop = path.slice(path.indexOf(current));
      if (loop.some((id) => inCycle.has(id))) continue;
      for (const id of loop) inCycle.add(id);
      problems.push({
        code: "cycle",
        partId: current,
        message: `Parts ${loop.map((id) => `"${id}"`).join(" -> ")} form a parent loop.`,
      });
    }
  }

  if (champion.moves.length < MOVE_COUNT) {
    problems.push({
      code: "too_few_moves",
      message: `There are ${champion.moves.length} moves; a champion needs exactly ${MOVE_COUNT}.`,
    });
  }
  return problems;
}

/** Verdict consistency, then the champion's structure. */
export function forgeResultProblems(result: ForgeResult): SheetProblem[] {
  if (result.verdict === "REJECT") {
    return result.rejection === null
      ? [{ code: "missing_rejection", message: "A REJECT verdict needs a rejection." }]
      : [];
  }
  if (result.champion === null) {
    return [{ code: "missing_champion", message: "A FORGE verdict needs a champion." }];
  }
  return validateChampion(result.champion);
}

// ---------------------------------------------------------------------------
// Balancing (code, not the model, enforces budgets)
// ---------------------------------------------------------------------------

/**
 * A sheet the game can trust, from whatever the model wrote. Deterministic
 * and idempotent; a sheet that already fits every budget comes back equal.
 * - parts: ids cleaned and deduped, one root torso (extra torsos become tail
 *   segments), orphans attached to the torso, unreachable parts and cycles
 *   dropped, parents before children, at most 40.
 * - stats and move powers rescaled to their sums within 1-5 (largest
 *   remainder); moves trimmed or padded to three and forced to two types.
 * - traits deduped, conflicts dropped, 2-4 kept (padded with neutral picks).
 * - markings (when present) on existing parts only, never in the part's own
 *   colour, masks only on a head or torso, one per part, at most 4.
 * - temperament clamped to 0-1 (two decimals); every string trimmed to its limit.
 */
export function balanceChampion(raw: Champion): Champion {
  const parts = balanceParts(raw.parts);
  // Older sheets have no markings key; leaving it absent keeps their hashes.
  const markings = raw.markings === undefined ? {} : { markings: balanceMarkings(raw.markings, parts) };
  const [heft, reach, chaos] = rescaleToSum(
    [raw.stats.heft, raw.stats.reach, raw.stats.chaos],
    STAT_SUM,
    STAT_MIN,
    STAT_MAX,
  ) as [Pip, Pip, Pip];
  const name = cleanText(raw.name, NAME_MAX) || "The Nameless One";
  return {
    bodyPlan: raw.bodyPlan,
    palette: { ...raw.palette },
    parts,
    ...markings,
    face: { ...raw.face },
    item: raw.item ?? (parts.some((part) => part.role === "item") ? "thing" : null),
    stats: { heft, reach, chaos },
    moves: balanceMoves(raw.moves),
    traits: balanceTraits(raw.traits, name),
    temperament: {
      aggression: unitInterval(raw.temperament.aggression),
      caution: unitInterval(raw.temperament.caution),
      showboating: unitInterval(raw.temperament.showboating),
    },
    name,
    bio: cleanText(raw.bio, BIO_MAX),
    narration: balanceNarration(raw.narration),
  };
}

export function normalizeRejection(rejection: Rejection): Rejection {
  return {
    reason: cleanText(rejection.reason, REJECTION_TEXT_MAX) || "The Foundry couldn't read that one.",
    suggestion: cleanText(rejection.suggestion, REJECTION_TEXT_MAX) || "Try again with a creature.",
  };
}

/**
 * Integers in [min, max] summing to `sum`, proportional to how far each input
 * sits above `min` (largest remainder; ties go to the larger input, then the
 * earlier one). All-integer arithmetic, so every runtime agrees. Inputs that
 * already fit come back unchanged.
 */
export function rescaleToSum(
  values: readonly number[],
  sum: number,
  min: number,
  max: number,
): number[] {
  const count = values.length;
  if (sum < count * min || sum > count * max) {
    throw new Error(`rescaleToSum: ${sum} is out of reach for ${count} values in ${min}..${max}`);
  }
  const clean = values.map((value) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min,
  );
  const weights = clean.map((value) => value - min);
  const capacity = max - min;
  const extra = clean.map(() => 0);
  let remaining = sum - count * min;
  let active = clean.map((_, index) => index).filter(() => capacity > 0);

  while (remaining > 0 && active.length > 0) {
    const total = active.reduce((acc, index) => acc + weights[index]!, 0);
    const weightOf = (index: number) => (total === 0 ? 1 : weights[index]!);
    const denominator = total === 0 ? active.length : total;

    const capped = active.filter(
      (index) => remaining * weightOf(index) >= (capacity - extra[index]!) * denominator,
    );
    if (capped.length > 0) {
      for (const index of capped) {
        remaining -= capacity - extra[index]!;
        extra[index] = capacity;
      }
      active = active.filter((index) => !capped.includes(index));
      continue;
    }

    let given = 0;
    const remainders = active.map((index) => {
      const share = Math.floor((remaining * weightOf(index)) / denominator);
      extra[index] = extra[index]! + share;
      given += share;
      return { index, remainder: (remaining * weightOf(index)) % denominator };
    });
    remainders.sort(
      (a, b) =>
        b.remainder - a.remainder || weights[b.index]! - weights[a.index]! || a.index - b.index,
    );
    for (let k = 0; k < remaining - given; k += 1) {
      const index = remainders[k]!.index;
      extra[index] = extra[index]! + 1;
    }
    remaining = 0;
  }
  return clean.map((_, index) => min + extra[index]!);
}

/** Trimmed, tag-free, single-line text cut gracefully to `max` characters. */
export function cleanText(text: string, max: number): string {
  return fitText(sanitize(text, 4 * max + 64), max).replace(/[\uD800-\uDBFF]$/u, "");
}

/** The id as stored: tag-free, trimmed, at most PART_ID_MAX characters. */
export function normalizePartId(id: string): string {
  return sanitize(id, PART_ID_MAX).trim();
}

function unitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

const isLimbAnchor = (anchor: Anchor | null) =>
  anchor !== null && (LEG_ANCHORS.includes(anchor) || ARM_ANCHORS.includes(anchor));

/** Per-part rules shared by balancing and live growth: clean ids, no mirrored torsos or paired limbs. */
function normalizePart(part: Part): Part {
  return {
    id: normalizePartId(part.id),
    role: part.role,
    shape: part.shape,
    size: part.size,
    elongation: part.elongation,
    parent: part.parent === null ? null : normalizePartId(part.parent) || null,
    anchor: part.anchor,
    color: part.color,
    ...(part.finish && part.finish !== "vinyl" ? { finish: part.finish } : {}),
    mirror: part.role === "torso" || isLimbAnchor(part.anchor) ? false : part.mirror,
  };
}

const asRoot = (part: Part): Part => ({ ...part, parent: null, anchor: null });

const DEFAULT_ANCHOR: Record<PartRole, Anchor> = {
  torso: "back",
  head: "top",
  leg: "bottom",
  arm: "front",
  wing: "back",
  tail: "back",
  horn: "top",
  ear: "top",
  fin: "back",
  spike: "back",
  item: "front",
};

function defaultAnchor(role: PartRole, used: Set<Anchor>): Anchor {
  const pool = role === "leg" ? LEG_ANCHORS : role === "arm" ? ARM_ANCHORS : [];
  return pool.find((anchor) => !used.has(anchor)) ?? DEFAULT_ANCHOR[role];
}

function balanceParts(rawParts: readonly Part[]): Part[] {
  const seen = new Set<string>();
  const parts: Part[] = [];
  for (const raw of rawParts) {
    const part = normalizePart(raw);
    if (!part.id || seen.has(part.id)) continue;
    seen.add(part.id);
    parts.push(part);
  }

  const root =
    parts.find((part) => part.role === "torso" && part.parent === null) ??
    parts.find((part) => part.role === "torso");
  let rootId: string;
  if (root) {
    rootId = root.id;
  } else {
    rootId = "torso";
    for (let n = 0; seen.has(rootId); n += 1) rootId = `torso${n}`;
    parts.unshift({
      id: rootId,
      role: "torso",
      shape: "capsule",
      size: "M",
      elongation: "normal",
      parent: null,
      anchor: null,
      color: "primary",
      mirror: false,
    });
  }

  // Extra torsos become trailing body segments; parentless parts join the torso.
  const fixed = parts.map((part): Part => {
    if (part.id === rootId) return asRoot(part);
    if (part.role === "torso") {
      return { ...part, role: "tail", parent: part.parent ?? rootId, anchor: part.anchor ?? "back" };
    }
    return part.parent === null ? { ...part, parent: rootId } : part;
  });

  const used = new Map<string, Set<Anchor>>();
  const usedOn = (parent: string) => {
    let set = used.get(parent);
    if (!set) used.set(parent, (set = new Set()));
    return set;
  };
  for (const part of fixed) {
    if (part.parent !== null && part.anchor !== null) usedOn(part.parent).add(part.anchor);
  }
  const anchored = fixed.map((part): Part => {
    if (part.parent === null || part.anchor !== null) return part;
    const anchor = defaultAnchor(part.role, usedOn(part.parent));
    usedOn(part.parent).add(anchor);
    return { ...part, anchor, mirror: isLimbAnchor(anchor) ? false : part.mirror };
  });

  // Parents before children, in the model's order; unreachable parts drop out.
  const placed = new Set<string>([rootId]);
  const ordered: Part[] = [anchored.find((part) => part.id === rootId)!];
  let pending = anchored.filter((part) => part.id !== rootId);
  let progress = true;
  while (progress && pending.length > 0) {
    progress = false;
    const next: Part[] = [];
    for (const part of pending) {
      if (part.parent !== null && placed.has(part.parent)) {
        ordered.push(part);
        placed.add(part.id);
        progress = true;
      } else {
        next.push(part);
      }
    }
    pending = next;
  }
  return ordered.slice(0, PARTS_MAX);
}

function balanceMarkings(rawMarkings: readonly Marking[], parts: readonly Part[]): Marking[] {
  const byId = new Map(parts.map((part) => [part.id, part]));
  const painted = new Set<string>();
  const markings: Marking[] = [];
  for (const raw of rawMarkings) {
    if (markings.length >= MARKINGS_MAX) break;
    const id = normalizePartId(raw.part);
    const part = byId.get(id);
    if (!part || painted.has(id) || raw.color === part.color) continue;
    if (raw.kind === "mask" && part.role !== "head" && part.role !== "torso") continue;
    painted.add(id);
    markings.push({ part: id, kind: raw.kind, color: raw.color });
  }
  return markings;
}

/** Retype preference by delivery when all three moves share a type. */
const RETYPE_ORDER: Record<Delivery, readonly MoveType[]> = {
  arm: ["STRIKE", "GRAPPLE", "TRICK"],
  leg: ["STRIKE", "TRICK", "GRAPPLE"],
  head: ["STRIKE", "TRICK", "GRAPPLE"],
  tail: ["GRAPPLE", "STRIKE", "TRICK"],
  item: ["STRIKE", "TRICK", "GRAPPLE"],
  body: ["GRAPPLE", "STRIKE", "TRICK"],
};

const FILLER_MOVES: Record<MoveType, Move> = {
  STRIKE: { name: "Wild Flail", type: "STRIKE", power: 3, delivery: "body" },
  GRAPPLE: { name: "Desperate Hug", type: "GRAPPLE", power: 3, delivery: "body" },
  TRICK: { name: "Nervous Sidestep", type: "TRICK", power: 3, delivery: "leg" },
};

function balanceMoves(rawMoves: readonly Move[]): Move[] {
  const moves = rawMoves.slice(0, MOVE_COUNT).map(
    (move): Move => ({
      name: cleanText(move.name, MOVE_NAME_MAX) || FILLER_MOVES[move.type].name,
      type: move.type,
      power: move.power,
      delivery: move.delivery,
    }),
  );
  while (moves.length < MOVE_COUNT) {
    const missing = MOVE_TYPES.find((type) => !moves.some((move) => move.type === type))!;
    moves.push({ ...FILLER_MOVES[missing] });
  }

  const powers = rescaleToSum(
    moves.map((move) => move.power),
    POWER_SUM,
    POWER_MIN,
    POWER_MAX,
  );
  let weakest = 0;
  for (const [index, move] of moves.entries()) {
    move.power = powers[index] as Pip;
    if (move.power <= moves[weakest]!.power) weakest = index;
  }

  // All one type: the weakest move (the last on a tie) switches by its delivery.
  if (new Set(moves.map((move) => move.type)).size < MIN_MOVE_TYPES) {
    const shared = moves[0]!.type;
    const move = moves[weakest]!;
    move.type = RETYPE_ORDER[move.delivery].find((type) => type !== shared)!;
  }
  return moves;
}

function balanceTraits(rawTraits: readonly Trait[], name: string): Trait[] {
  const conflicts = (a: Trait, b: Trait) =>
    CONFLICTING_TRAITS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const traits: Trait[] = [];
  for (const trait of rawTraits) {
    if (traits.length >= TRAITS_MAX) break;
    if (traits.includes(trait) || traits.some((kept) => conflicts(kept, trait))) continue;
    traits.push(trait);
  }
  const start = stableHash(name) % NEUTRAL_TRAITS.length;
  for (let k = 0; traits.length < TRAITS_MIN && k < NEUTRAL_TRAITS.length; k += 1) {
    const pick = NEUTRAL_TRAITS[(start + k) % NEUTRAL_TRAITS.length]!;
    if (!traits.includes(pick)) traits.push(pick);
  }
  return traits;
}

const FALLBACK_NARRATION: Narration = {
  walkOn: ["Here it comes.", "It has arrived, unfortunately."],
  landHit: ["That one landed.", "Direct hit!", "Ouch, for somebody."],
  takeHit: ["That stung.", "It felt that one."],
  win: ["Victory, somehow.", "The crowd goes mild."],
  lose: ["It will be back. Probably.", "Down it goes."],
  ringOut: ["And it's gone!", "Over the edge!"],
};

function balanceNarration(raw: Narration): Narration {
  const pool = (key: keyof Narration): string[] => {
    const count = NARRATION_COUNTS[key];
    const lines = raw[key].map((line) => cleanText(line, NARRATION_LINE_MAX)).filter(Boolean);
    const source = lines.length > 0 ? lines : FALLBACK_NARRATION[key];
    return Array.from({ length: count }, (_, index) => source[index % source.length]!);
  };
  return {
    walkOn: pool("walkOn"),
    landHit: pool("landHit"),
    takeHit: pool("takeHit"),
    win: pool("win"),
    lose: pool("lose"),
    ringOut: pool("ringOut"),
  };
}

// ---------------------------------------------------------------------------
// Live growth
// ---------------------------------------------------------------------------

/**
 * The longest prefix of streamed parts the stage can grow right now: a torso
 * first, then parts whose parent is already in the prefix. It stops at the
 * first part that is incomplete or does not fit (the final sheet fixes the
 * rest). Accepts a partial ForgeResult, a partial Champion, or a parts array.
 * A part counts once every field is present; `mirror` is the last property
 * in streaming order, so its arrival means the strings before it are closed.
 */
export function parsePartialParts(partial: unknown): Part[] {
  const parts = partsArrayOf(partial);
  const out: Part[] = [];
  const ids = new Set<string>();
  for (const raw of parts) {
    if (out.length >= PARTS_MAX) break;
    const parsed = PartSchema.safeParse(raw);
    if (!parsed.success) break;
    const normalized = normalizePart(parsed.data);
    const part = out.length === 0 ? asRoot(normalized) : normalized;
    if (!part.id || ids.has(part.id)) break;
    if (out.length === 0 ? part.role !== "torso" : part.role === "torso") break;
    if (out.length > 0 && (part.parent === null || !ids.has(part.parent) || !part.anchor)) break;
    out.push(part);
    ids.add(part.id);
  }
  return out;
}

function partsArrayOf(partial: unknown): unknown[] {
  if (Array.isArray(partial)) return partial;
  if (typeof partial !== "object" || partial === null) return [];
  const record = partial as Record<string, unknown>;
  if ("champion" in record) return partsArrayOf(record.champion ?? null);
  return Array.isArray(record.parts) ? record.parts : [];
}

// ---------------------------------------------------------------------------
// Derived values (never asked of the model)
// ---------------------------------------------------------------------------

/** Root parts of a role (not chained off another part of the same role), mirrors counted twice. */
function limbCount(champion: Champion, role: "leg" | "arm"): number {
  const roleOf = new Map(champion.parts.map((part) => [part.id, part.role]));
  return champion.parts
    .filter((part) => part.role === role && (part.parent === null || roleOf.get(part.parent) !== role))
    .reduce((count, part) => count + (part.mirror ? 2 : 1), 0);
}

export function legCount(champion: Champion): number {
  return limbCount(champion, "leg");
}

/** 0, 2 or 4: one arm reads as a pair, three or more as four. */
export function armCount(champion: Champion): 0 | 2 | 4 {
  const arms = limbCount(champion, "arm");
  return arms === 0 ? 0 : arms <= 2 ? 2 : 4;
}

export function maxHealth(champion: Champion): number {
  return HEALTH_BASE + HEALTH_PER_HEFT * champion.stats.heft;
}

const SCALE_PER_HEFT = 0.08;
const TINY_SCALE = 0.72;
const HUGE_SCALE = 1.3;

/** Size relative to the standard 1-unit fighter: Heft 3 is 1, then the tiny and huge traits. */
export function championScale(champion: Champion): number {
  let scale = 1 + (champion.stats.heft - 3) * SCALE_PER_HEFT;
  if (champion.traits.includes("tiny")) scale *= TINY_SCALE;
  if (champion.traits.includes("huge")) scale *= HUGE_SCALE;
  return Math.round(scale * 1000) / 1000;
}

/** The roster-card tag: "Hexapod" and "Octopod" for six- and eight-legged multipeds. */
export function bodyPlanLabel(champion: Champion): string {
  if (champion.bodyPlan === "MULTIPED") {
    const legs = legCount(champion);
    if (legs === 6) return "Hexapod";
    if (legs === 8) return "Octopod";
  }
  return BODY_PLAN_INFO[champion.bodyPlan].label;
}

/** JSON with object keys sorted at every level, so equal data always prints the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item ?? null)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The sheet hash (mesh cache key, sim seed mix): FNV-1a 32-bit of the stable JSON, 8 hex digits. */
export function championHash(champion: Champion): string {
  return stableHash(stableStringify(champion)).toString(16).padStart(8, "0");
}
