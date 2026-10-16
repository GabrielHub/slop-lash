// Prompt text rendered from the contract vocabularies, so the prompts can
// never drift from what the schema and the game accept. Pure: no SDK imports.

import { ARENAS, type ArenaId } from "../arenas";
import { finishGroups } from "../finishes";
import type { Champion } from "../sheet";
import {
  EYE_STYLE_INFO,
  FINISH_INFO,
  MARKING_INFO,
  MOUTH_STYLE_INFO,
  MOVE_TYPE_INFO,
  PROP_INFO,
  TOY_COLORS,
  TRAIT_INFO,
} from "../vocab";

const lines = (entries: readonly string[]) => entries.join("\n");

/** Every vocabulary the forge picks from, one compact line per entry. */
export function vocabularyText(): string {
  return [
    "<vocabulary>",
    "Use these words exactly; nothing outside these lists is valid.",
    "",
    `Toy colours (palette primary, secondary, accent): ${TOY_COLORS.join(", ")}.`,
    "",
    "Traits (what each does in a fight):",
    lines(Object.entries(TRAIT_INFO).map(([trait, info]) => `- ${trait}: ${info}`)),
    "",
    "Eyes:",
    lines(Object.entries(EYE_STYLE_INFO).map(([style, info]) => `- ${style}: ${info}`)),
    "",
    "Mouths:",
    lines(Object.entries(MOUTH_STYLE_INFO).map(([style, info]) => `- ${style}: ${info}`)),
    "",
    "Finishes (what a part is made of; vinyl unless it is made of something):",
    lines(Object.entries(FINISH_INFO).map(([finish, info]) => `- ${finish}: ${info.prompt}`)),
    "",
    "Markings (paint on one part, in a palette slot that is not that part's own colour):",
    lines(Object.entries(MARKING_INFO).map(([kind, info]) => `- ${kind}: ${info}`)),
    "",
    "Held items: pick the tag whose description names the object or its kind, and use thing when none does (a teddy bear, a lamp, a bag of chips). Match what the object is, never just its shape or size: a candle is not a baguette, a flashlight is not a sword, a ruler is not a wand. A wrong tag puts the wrong prop in its hand.",
    lines(Object.entries(PROP_INFO).map(([tag, info]) => `- ${tag}: ${info.description}`)),
    "",
    "Move types:",
    lines(Object.entries(MOVE_TYPE_INFO).map(([type, info]) => `- ${type}: ${info.description}`)),
    "</vocabulary>",
  ].join("\n");
}

/** Tonight's arenas with their mood and hazard cards. */
export function arenasText(arenas: readonly ArenaId[]): string {
  const entries = arenas.map((id) => {
    const arena = ARENAS[id];
    const hazards = arena.hazards.map((hazard) => `  - ${hazard.title}: ${hazard.card}`);
    return [`- ${arena.name}: ${arena.mood}`, ...hazards].join("\n");
  });
  return entries.join("\n");
}

/** One arena for a single fight. */
export function arenaText(id: ArenaId): string {
  return arenasText([id]);
}

/** A champion as the matchup and recap calls read it: identity and numbers, no body graph. */
export function championCard(champion: Champion): string {
  const moves = champion.moves
    .map((move) => `${move.name} (${move.type} ${move.power}, ${move.delivery})`)
    .join("; ");
  const groups = finishGroups(champion);
  const finishes = groups.map((group) => group.label.toLowerCase());
  const rest = groups.some((group) => group.where === "everything") ? "" : ", the rest vinyl";
  return [
    `name: ${champion.name}`,
    `bio: ${champion.bio}`,
    `body: ${champion.bodyPlan}, ${champion.parts.length} parts`,
    ...(finishes.length > 0 ? [`made of: ${finishes.join(", ")}${rest}`] : []),
    `item: ${champion.item ?? "none"}`,
    `traits: ${champion.traits.join(", ")}`,
    `stats: heft ${champion.stats.heft}, reach ${champion.stats.reach}, chaos ${champion.stats.chaos}`,
    `moves: ${moves}`,
  ].join("\n");
}
