// An upgrade keeps the champion. Whatever the model rewrote, the parts,
// markings, face, colours and finishes the champion already had come back
// exactly, unless the player's addition text asks for that change. The forge applies
// preserveUpgrade to every upgrade result and preserveUpgradePartial to each
// streamed partial, which needs only the previous sheet, so a growing upgrade
// never flips colour when the final sheet lands. Pure and deterministic.

import type { DeepPartial } from "ai";
import { MARKINGS_MAX, PARTS_MAX } from "../constants";
import {
  balanceChampion,
  legCount,
  type Champion,
  type Finish,
  type ForgeResult,
  type Marking,
  type Palette,
  type Part,
  type PartColor,
  type PartRole,
} from "../sheet";
import { FINISHES, TOY_COLORS } from "../vocab";
import { planForLegs } from "./body-plan";

const SLOTS = ["primary", "secondary", "accent"] as const satisfies readonly PartColor[];

/** One case-insensitive whole-word pattern; each word may take one of `suffixes`. */
function wordPattern(words: readonly string[], suffixes = ""): RegExp {
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/ /gu, "\\s+"));
  return new RegExp(`\\b(?:${escaped.join("|")})${suffixes}\\b`, "iu");
}

/** A colour word lets the model repaint the whole palette. */
const COLOUR_WORDS = wordPattern(
  [
    ...TOY_COLORS,
    "red",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "violet",
    "pink",
    "white",
    "black",
    "brown",
    "grey",
    "gray",
    "gold",
    "golden",
    "silver",
    "cream",
    "beige",
    "rainbow",
    "colour",
    "color",
    "paint",
  ],
  "(?:s|ed|ing|ful)?",
);

/** The words that name a role: a part of a named role may change. */
const ROLE_WORDS: Record<PartRole, RegExp | null> = {
  torso: wordPattern(["body", "bodies", "torso", "torsos"]),
  head: wordPattern(["head", "heads", "neck", "necks"]),
  leg: wordPattern(["leg", "legs"]),
  arm: wordPattern(["arm", "arms"]),
  wing: wordPattern(["wing", "wings"]),
  tail: wordPattern(["tail", "tails"]),
  horn: wordPattern(["horn", "horns"]),
  ear: wordPattern(["ear", "ears"]),
  fin: wordPattern(["fin", "fins"]),
  spike: wordPattern(["spike", "spikes", "spine", "spines"]),
  item: null,
};

/** Removing or replacing something: dropped parts stay dropped. */
const REMOVAL_WORDS = wordPattern([
  "lose",
  "loses",
  "losing",
  "lost",
  "remove",
  "removes",
  "removed",
  "without",
  "no more",
  "chop",
  "chops",
  "chopped",
  "cut off",
  "cuts off",
  "fell off",
  "falls off",
  "missing",
  "replace",
  "replaces",
  "replaced",
  "instead",
  "swap",
  "swaps",
  "swapped",
  "trade",
  "trades",
  "traded",
]);

/**
 * A word for what something is made of: every material word the forge prompt
 * names for a finish (FINISH_INFO, kept in step by upgrade.test.ts), plus the
 * finish names. With a part named, those parts may change finish ("metal
 * arms"); with none named, every part may ("turn it to gold").
 */
const FINISH_WORDS = wordPattern(
  [
    ...FINISHES,
    "metallic",
    "steel",
    "iron",
    "chrome",
    "tin",
    "plating",
    "plated",
    "armour",
    "armor",
    "armoured",
    "armored",
    "machinery",
    "mechanical",
    "golden",
    "gilded",
    "brass",
    "trophy",
    "trophies",
    "crystals",
    "diamond",
    "diamonds",
    "gem",
    "gems",
    "glass",
    "ruby",
    "sapphire",
    "emerald",
    "quartz",
    "rock",
    "marble",
    "granite",
    "concrete",
    "statue",
    "statues",
    "golem",
    "golems",
    "boulder",
    "boulders",
    "wooden",
    "bark",
    "plank",
    "planks",
    "log",
    "logs",
    "branch",
    "branches",
    "icy",
    "frozen",
    "frost",
    "icicle",
    "icicles",
    "glacier",
    "glaciers",
    "magma",
    "molten",
    "fire",
    "flaming",
    "burning",
    "ember",
    "embers",
    "slimy",
    "goo",
    "gooey",
    "ooze",
    "jelly",
    "gelatin",
    "sludge",
    "gum",
    "glowing",
    "neon",
    "radioactive",
    "ghostly",
    "electric",
    "plasma",
    "hologram",
    "holograms",
    "plastic",
    "made of",
  ],
);

/** Whether the text names a material (FINISH_WORDS). */
export const namesMaterial = (text: string) => FINISH_WORDS.test(text);

const EYE_WORDS = wordPattern(["eye", "eyes", "glasses", "sunglasses", "visor", "visors", "goggles", "monocle"]);
const MOUTH_WORDS = wordPattern(["mouth", "smile", "teeth", "fangs", "tongue", "beak", "grin"]);

/** Whether the addition text names this part, by its id (without a trailing number) or its role. */
function named(part: Part, text: string): boolean {
  const role = ROLE_WORDS[part.role];
  if (role?.test(text)) return true;
  const base = part.id.toLowerCase().replace(/\d+$/u, "");
  return base.length > 1 && wordPattern([base], "(?:s|es)?").test(text);
}

/** The part with `finish` (absent for vinyl, as balanceChampion stores it), key order kept. */
function withFinish(part: Part, finish: Finish | undefined): Part {
  const { mirror, ...rest } = part;
  delete rest.finish;
  return { ...rest, ...(finish && finish !== "vinyl" ? { finish } : {}), mirror };
}

/**
 * Whether the addition may give this existing part `finish`: the text has a
 * material word and names that part or none, or the drawing painted that
 * finish's material ink (`inks`) somewhere.
 */
function finishOpen(
  previous: Champion,
  text: string,
  inks: readonly Finish[],
): (old: Part, finish: Finish | undefined) => boolean {
  const worded = namesMaterial(text);
  const namesPart = worded && previous.parts.some((part) => named(part, text));
  return (old, finish) => (worded && (!namesPart || named(old, text))) || inks.includes(finish ?? "vinyl");
}

/**
 * The palette slots the champion visibly uses: every part's and marking's
 * slot, plus the accent when it paints a beak mouth, visor eyes or the
 * generic held prop.
 */
function slotsInUse(champion: Champion): Set<PartColor> {
  const used = new Set<PartColor>();
  for (const part of champion.parts) used.add(part.color);
  for (const marking of champion.markings ?? []) used.add(marking.color);
  if (champion.face.mouth === "beak" || champion.face.eyes === "visor" || champion.item === "thing") {
    used.add("accent");
  }
  return used;
}

/**
 * The palette after an upgrade: a slot the champion uses keeps its colour,
 * and a slot it does not use may take the model's new colour. A colour word
 * in the addition text accepts the model's whole palette.
 */
function keptPalette<P extends Partial<Palette>>(previous: Champion, palette: P, text: string): P {
  if (COLOUR_WORDS.test(text)) return { ...palette };
  const used = slotsInUse(previous);
  const kept: P = { ...palette };
  for (const slot of SLOTS) if (used.has(slot)) kept[slot] = previous.palette[slot];
  return kept;
}

/** Inserts a part after its parent's last descendant already in the list. */
function insertUnderParent(parts: Part[], part: Part): Part[] {
  const parentOf = new Map(parts.map((candidate) => [candidate.id, candidate.parent]));
  const under = (id: string) => {
    for (let current: string | null | undefined = id; current; current = parentOf.get(current)) {
      if (current === part.parent) return true;
    }
    return false;
  };
  let at = -1;
  parts.forEach((candidate, index) => {
    if (under(candidate.id)) at = index;
  });
  return at < 0 ? parts : [...parts.slice(0, at + 1), part, ...parts.slice(at + 1)];
}

/**
 * The upgraded champion with everything it already had put back:
 * - palette: a slot the champion uses keeps its colour unless the text has a
 *   colour word; an unused slot may be recoloured for the addition.
 * - parts: every previous part the model kept comes back exactly (slot, role,
 *   shape, size, elongation, parent, anchor, mirror) unless the text names its
 *   role or id ("longer legs"); a dropped part comes back under its parent
 *   unless the text removes or replaces something, within PARTS_MAX.
 * - finishes: an existing part keeps its finish unless the text has a word
 *   for a material and either names that part or names no part at all
 *   ("metal arms" changes the arms, "turn it to gold" changes everything),
 *   or the new finish is a material ink the drawing used (`inkFinishes`).
 * - markings: the previous ones on parts still there, first; new ones after,
 *   within MARKINGS_MAX. A named part may take the model's new marking.
 * - face: eyes and mouth come back unless the text mentions them; the held
 *   item tag comes back when the model dropped it but the item part remains.
 * Then balanced again, with the body plan its legs imply. Idempotent.
 */
export function preserveUpgrade(
  previous: Champion,
  next: Champion,
  additionText: string,
  inkFinishes: readonly Finish[] = [],
): Champion {
  const text = additionText;
  const before = new Map(previous.parts.map((part) => [part.id, part]));
  const changeable = (id: string) => {
    const part = before.get(id);
    return part !== undefined && named(part, text);
  };

  const nextById = new Map(next.parts.map((part) => [part.id, part]));
  const open = finishOpen(previous, text, inkFinishes);
  let parts = next.parts.map((part) => {
    const old = before.get(part.id);
    return old && !named(old, text) ? { ...old } : part;
  });
  if (!REMOVAL_WORDS.test(text)) {
    for (const old of previous.parts) {
      if (parts.some((part) => part.id === old.id)) continue;
      if (parts.length >= PARTS_MAX) break;
      if (old.parent === null) {
        if (!parts.some((part) => part.role === "torso")) parts = [{ ...old }, ...parts];
      } else if (parts.some((part) => part.id === old.parent)) {
        parts = insertUnderParent(parts, { ...old });
      }
    }
  }

  // Finishes: an existing part keeps its own unless the text may change it.
  parts = parts.map((part) => {
    const old = before.get(part.id);
    if (!old) return part;
    const finish = (nextById.get(part.id) ?? old).finish;
    return withFinish(part, open(old, finish) ? finish : old.finish);
  });

  const ids = new Set(parts.map((part) => part.id));
  const markings: Marking[] = [];
  const painted = (id: string) => markings.some((marking) => marking.part === id);
  for (const old of previous.markings ?? []) {
    if (!ids.has(old.part) || painted(old.part)) continue;
    const fresh = changeable(old.part) ? next.markings?.find((marking) => marking.part === old.part) : undefined;
    markings.push({ ...(fresh ?? old) });
  }
  for (const marking of next.markings ?? []) {
    if (markings.length >= MARKINGS_MAX) break;
    if (painted(marking.part)) continue;
    const hadOne = previous.markings?.some((old) => old.part === marking.part) ?? false;
    if (hadOne && !changeable(marking.part)) continue;
    markings.push({ ...marking });
  }

  const face = {
    eyes: EYE_WORDS.test(text) ? next.face.eyes : previous.face.eyes,
    mouth: MOUTH_WORDS.test(text) ? next.face.mouth : previous.face.mouth,
  };
  const keepsItem = previous.parts.some((part) => part.role === "item" && ids.has(part.id));
  const item = next.item ?? (keepsItem ? previous.item : null);

  const balanced = balanceChampion({
    ...next,
    palette: keptPalette(previous, next.palette, text),
    parts,
    markings: markings.slice(0, MARKINGS_MAX),
    face,
    item,
  });
  return { ...balanced, bodyPlan: planForLegs(balanced.bodyPlan, legCount(balanced)) };
}

type ChampionPartial = NonNullable<DeepPartial<ForgeResult>["champion"]>;

/**
 * A streamed upgrade partial with the colours the final sheet will have: the
 * palette slots the champion uses, and the slot and finish of every finished
 * part that was already on the champion. It reads nothing but `previous`, so
 * the colours never change between growth and the final sheet. Never throws.
 */
export function preserveUpgradePartial<T>(
  previous: Champion,
  partial: T,
  additionText: string,
  inkFinishes: readonly Finish[] = [],
): T {
  if (typeof partial !== "object" || partial === null) return partial;
  const record = partial as { champion?: ChampionPartial | null };
  const champion = record.champion;
  if (typeof champion !== "object" || champion === null) return partial;
  const before = new Map(previous.parts.map((part) => [part.id, part]));
  const palette = keptPalette(previous, (champion.palette ?? {}) as Partial<Palette>, additionText);
  const open = finishOpen(previous, additionText, inkFinishes);
  const parts = Array.isArray(champion.parts)
    ? champion.parts.map((part) => {
        // A part is finished once `mirror`, its last property, has streamed.
        if (typeof part !== "object" || part === null || typeof part.mirror !== "boolean") return part;
        const old = typeof part.id === "string" ? before.get(part.id) : undefined;
        if (!old) return part;
        const kept = named(old, additionText) ? part : { ...part, color: old.color };
        return open(old, part.finish as Finish | undefined) ? kept : { ...kept, finish: old.finish ?? "vinyl" };
      })
    : champion.parts;
  return { ...partial, champion: { ...champion, palette, ...(parts === undefined ? {} : { parts }) } };
}
