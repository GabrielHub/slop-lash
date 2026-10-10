// The house call: descriptions for the house champions, written the way a
// player would type them into "Describe it", then forged like a player's.
// Variety comes from a per-game seed rendered into the CALL block only, so
// the static brief stays cached. Pure: no SDK runtime imports.

import type { InstructionBlock } from "@/lib/ai/prompt";
import { seededShuffle } from "@/lib/hash";
import type { ArenaId } from "../arenas";
import { DESCRIBE_TEXT_MAX } from "../constants";
import { arenasText } from "./prompt-parts";

export const HOUSE_PROMPT_VERSION = 1;

const HOUSE_STATIC = `<house>
You write the house champions for SlopFight, a party game on a TV. Friends draw or describe creatures on their phones, the Foundry forges each one into a chunky toy fighter, and the fighters brawl on their own in a small arena while the room bets. When fewer than four people play, the house fills the bracket with its own champions. You write what a player would type into the "Describe it" box; the Foundry then forges each description live on the TV, and the room should want to bet on it or against it.
</house>

<craft>
- Each description is one or two sentences, at most ${DESCRIBE_TEXT_MAX} characters: a creature or object that could fight, its body (how many legs, or none; wings, a tail, something odd), what it holds or wears, and one unexpected specific detail the room will laugh at.
- Make the set varied: different body shapes (lots of legs, no legs that bounces or slithers, upright on two legs, maybe something that flies), different sizes and different kinds of joke. No two from the same family of thing.
- Ridiculous, specific and fond. Funny nouns do half the work, and one unexpected specific detail beats three adjectives.
- Sometimes give it a name, the way a player would ("this is Doreen, a ..."). Pick an unexpected name, never the stock comedy ones (Dennis, Gary, Kevin, Barry, Steve, Gerald).
- The toy body has at most eight legs and four arms, so say "lots of legs", not forty.
- You may nod to tonight's arenas in at most one description.
- Never real people, never characters or mascots from films, games, shows or brands, and nothing hateful, sexual or gory.
- Write descriptions, not sheets: no stats, move lists or rules.
</craft>

<examples>
These show the bar. Never reuse them, their creatures or their jokes.
- A sourdough starter that escaped the fridge and now walks on four crusty legs. It has opinions about your bread.
- A robot vacuum with a kitchen knife taped to the top, still beeping apologetically when it bumps into things.
- This is Doreen, a goose in a hi-vis vest who directs traffic nobody asked her to direct.
- An octopus who owns exactly one sock and wears it on a different tentacle every day.
- A haunted garden gnome holding a tiny fishing rod. Nobody has ever seen it move.
- A wheel of brie with six stubby legs, sweating slightly, ready to throw hands.
</examples>

<output>
Reply with one description per champion the call block asks for, in the champions list.
</output>`;

/** Sparks for variety, drawn per game by the seed. Never in a cached block. */
const SPARKS = [
  "a laminated menu",
  "tax season",
  "a bouncy castle",
  "a lost mitten",
  "a timeshare",
  "the night shift",
  "a jury summons",
  "a car wash",
  "a retirement party",
  "a lighthouse",
  "a vending machine",
  "an expired coupon",
  "a marching band",
  "a dentist's waiting room",
  "a karaoke machine",
  "a broken umbrella",
  "a medieval jousting fair",
  "a sock drawer",
  "a garden hose",
  "a school picture day",
  "a wedding DJ",
  "a camping trip gone wrong",
  "a pawn shop",
  "a weather balloon",
  "the deep end of the pool",
  "a group chat",
  "a lunch lady",
  "a museum gift shop",
  "a snow day",
  "a parking ticket",
  "an escape room",
  "a pet rock",
  "a dinner theatre",
  "a moving truck",
  "an all-you-can-eat buffet",
  "a haunted laundromat",
  "a book club",
  "a used car lot",
  "a hot air balloon",
  "a yard sale",
  "a sushi conveyor belt",
  "a bowling alley",
  "a self-checkout",
  "a mime",
  "a fax machine",
  "an inflatable flamingo",
  "a cuckoo clock",
  "a substitute teacher",
] as const;

export function houseSparks(seed: number, count = 3): string[] {
  return seededShuffle(SPARKS, `house:${seed}`).slice(0, count);
}

export function houseInstructions(arenas: readonly ArenaId[]): InstructionBlock[] {
  return [
    { text: HOUSE_STATIC, cache: "static" },
    { text: `<tonight>\nTonight's arenas:\n${arenasText(arenas)}\n</tonight>`, cache: "game" },
  ];
}

export function housePrompt(count: number, seed: number): string {
  return [
    `Write exactly ${count} house champion description${count === 1 ? "" : "s"}.`,
    `Tonight's sparks, to push you somewhere new (use them loosely or not at all): ${houseSparks(seed).join("; ")}.`,
  ].join("\n");
}
