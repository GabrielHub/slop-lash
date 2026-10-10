// SlopFight's fixed vocabularies: every word the forge model may pick, with the
// player-facing or prompt-facing line that goes with it. Mechanics live in
// modifiers.ts (traits) and arenas.ts (hazards); this file is words and colours.

// ---------------------------------------------------------------------------
// Body graph enums (the sheet's part DSL)
// ---------------------------------------------------------------------------

export const BODY_PLANS = ["BIPED", "QUADRUPED", "MULTIPED", "HOPPER", "SLITHER", "FLIER"] as const;
export type BodyPlan = (typeof BODY_PLANS)[number];

export const BODY_PLAN_INFO = {
  BIPED: { label: "Biped", description: "Two legs, upright. Arms optional." },
  QUADRUPED: { label: "Quadruped", description: "Four legs, body level with the floor." },
  MULTIPED: { label: "Multiped", description: "Six or eight legs. Stable and slow to turn." },
  HOPPER: { label: "Hopper", description: "No legs. Bounces everywhere, lands hard." },
  SLITHER: { label: "Slither", description: "No legs. Undulates low along the floor." },
  FLIER: { label: "Flier", description: "Wings and dangling feet. Hovers, gets swatted." },
} as const satisfies Record<BodyPlan, { label: string; description: string }>;

export const PART_ROLES = [
  "torso",
  "head",
  "leg",
  "arm",
  "wing",
  "tail",
  "horn",
  "ear",
  "fin",
  "spike",
  "item",
] as const;
export type PartRole = (typeof PART_ROLES)[number];

export const PART_SHAPES = ["capsule", "sphere", "cone", "box"] as const;
export type PartShape = (typeof PART_SHAPES)[number];

export const PART_SIZES = ["S", "M", "L", "XL"] as const;
export type PartSize = (typeof PART_SIZES)[number];

export const ELONGATIONS = ["stubby", "normal", "long"] as const;
export type Elongation = (typeof ELONGATIONS)[number];

/** Where a part attaches on its parent. Legs and arms pair odd-left, even-right, front to back. */
export const ANCHORS = [
  "top",
  "bottom",
  "front",
  "back",
  "left",
  "right",
  "leg1",
  "leg2",
  "leg3",
  "leg4",
  "leg5",
  "leg6",
  "leg7",
  "leg8",
  "arm1",
  "arm2",
  "arm3",
  "arm4",
] as const;
export type Anchor = (typeof ANCHORS)[number];

export const LEG_ANCHORS = ANCHORS.filter((anchor) => anchor.startsWith("leg"));
export const ARM_ANCHORS = ANCHORS.filter((anchor) => anchor.startsWith("arm"));

/** Which palette slot a part is painted with. */
export const PART_COLORS = ["primary", "secondary", "accent"] as const;
export type PartColor = (typeof PART_COLORS)[number];

export const MOVE_TYPES = ["STRIKE", "GRAPPLE", "TRICK"] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

export const MOVE_TYPE_INFO = {
  STRIKE: { label: "Strike", description: "A fast hit with knockback. Beats a Trick's setup." },
  GRAPPLE: {
    label: "Grapple",
    description: "A lift and throw that ignores stagger resistance. Needs to get close.",
  },
  TRICK: {
    label: "Trick",
    description: "A feint or dodge that punishes a committed attacker. Beats a Grapple's approach.",
  },
} as const satisfies Record<MoveType, { label: string; description: string }>;

/** What a move hits with. */
export const DELIVERIES = ["arm", "leg", "head", "tail", "item", "body"] as const;
export type Delivery = (typeof DELIVERIES)[number];

// ---------------------------------------------------------------------------
// Traits (effects in modifiers.ts TRAIT_EFFECTS)
// ---------------------------------------------------------------------------

export const TRAITS = [
  "heavy",
  "slippery",
  "armed",
  "flammable",
  "electric",
  "aquatic",
  "tiny",
  "smug",
  "fragile",
  "sticky",
  "spiky",
  "cowardly",
  "relentless",
  "armored",
  "bouncy",
  "fluffy",
  "venomous",
  "loud",
  "sneaky",
  "clumsy",
  "nimble",
  "huge",
  "ancient",
  "magnetic",
  "frosty",
  "explosive",
  "rubbery",
  "stinky",
  "regal",
  "feral",
  "caffeinated",
  "haunted",
  "metallic",
  "wooden",
  "lanky",
  "sleepy",
  "dramatic",
  "hungry",
  "slimy",
  "stubborn",
  "buff",
] as const;
export type Trait = (typeof TRAITS)[number];

/** One player-facing line per trait. Keep in step with TRAIT_EFFECTS. */
export const TRAIT_INFO = {
  heavy: "Built like a fridge: hard to shove, slow to get going.",
  slippery: "Wriggles out of grabs, but can't keep its footing.",
  armed: "Hands full of weapon: hits harder, hugs worse.",
  flammable: "Burns bright: hits harder and gets hurt more.",
  electric: "Every touch zaps, including the ones it takes.",
  aquatic: "Low and soggy: hard to knock around, a bit slow on dry land.",
  tiny: "Hard to hit, quick on its feet, very easy to launch.",
  smug: "Masterful feints, but it poses after every hit it lands.",
  fragile: "Fast and hard-hitting, and it shatters easily.",
  sticky: "Whatever it grabs stays grabbed. So does the floor.",
  spiky: "Grabbing it hurts. All those spines slow it down.",
  cowardly: "Quick on its feet, and quicker to flee when losing.",
  relentless: "Never backs off and shrugs off small hits.",
  armored: "Plated up: takes less damage, moves slower.",
  bouncy: "Boings past attacks, and boings far when hit.",
  fluffy: "Hits sink into the fluff, but there's a lot of fluff to hit.",
  venomous: "Its hits sting more and push less.",
  loud: "Nobody can be subtle near it, itself included.",
  sneaky: "Loves a feint, hates a fair fight.",
  clumsy: "Flails wildly, lands lucky big hits, trips easily.",
  nimble: "Light on its feet, easy to knock off balance.",
  huge: "Long reach, big target, slow turns.",
  ancient: "Knows every old trick and moves like it.",
  magnetic: "Pulls foes in for a grab, too clingy for tricks.",
  frosty: "Chills the air: everyone slows down, the foe most.",
  explosive: "Its hits send foes flying; every hit it takes sets something off.",
  rubbery: "Soaks up hits, then bounces far.",
  stinky: "Foes hesitate near it, and it can't sneak up on anyone.",
  regal: "Too dignified to stagger, too dignified to hurry.",
  feral: "No finesse, hits harder, goes wild when hurt.",
  caffeinated: "Twitchy and fast, with no patience for tricks.",
  haunted: "Flickers in and out: hard to hit, hard to predict.",
  metallic: "Clangs foes backward, but it's a heavy tin can.",
  wooden: "Stiff as a plank: hard to stagger, bad at tricks.",
  lanky: "Long limbs, wobbly balance.",
  sleepy: "Dozes through the opening seconds, too relaxed to get hurt much.",
  dramatic: "Plays to the crowd: big hits, big flops, big poses.",
  hungry: "Chomps first, asks later: huge grabs, slow, no tricks.",
  slimy: "Splats instead of flying, and squelches along slowly.",
  stubborn: "Won't be shoved by wind or shoulder, and won't hurry either.",
  buff: "All muscle: hits and grabs harder, no subtlety at all.",
} as const satisfies Record<Trait, string>;

/** Pairs that contradict each other; balanceChampion keeps the first one listed on the sheet. */
export const CONFLICTING_TRAITS: readonly (readonly [Trait, Trait])[] = [
  ["tiny", "huge"],
  ["cowardly", "relentless"],
  ["sleepy", "caffeinated"],
];

/** Harmless traits balanceChampion pads with when the model gave fewer than two. */
export const NEUTRAL_TRAITS = ["loud", "sneaky", "clumsy"] as const satisfies readonly Trait[];

// ---------------------------------------------------------------------------
// Toy colours
// ---------------------------------------------------------------------------

export const TOY_COLORS = [
  "tomato",
  "cherry",
  "rust",
  "tangerine",
  "butter",
  "sand",
  "lime",
  "moss",
  "mint",
  "teal",
  "sky",
  "ocean",
  "cobalt",
  "lilac",
  "grape",
  "bubblegum",
  "blush",
  "cocoa",
  "charcoal",
  "bone",
] as const;
export type ToyColor = (typeof TOY_COLORS)[number];

/**
 * Matte soft-vinyl values tuned for a warm key light: saturated but never
 * neon, and no cyan-magenta pair. `dark` is the same hue darkened for the
 * inverted-hull outline (never pure black).
 */
export const TOY_COLOR_VALUES = {
  tomato: { hex: "#E8553D", dark: "#8A2A1E" },
  cherry: { hex: "#C8323F", dark: "#6E1820" },
  rust: { hex: "#B5532C", dark: "#5E2914" },
  tangerine: { hex: "#F28B30", dark: "#8F4712" },
  butter: { hex: "#F5C94C", dark: "#8C6A16" },
  sand: { hex: "#E2C39A", dark: "#7E6243" },
  lime: { hex: "#A6CB45", dark: "#56701C" },
  moss: { hex: "#6E8B3D", dark: "#36461A" },
  mint: { hex: "#7FD1AE", dark: "#33735A" },
  teal: { hex: "#2A9D8F", dark: "#13544C" },
  sky: { hex: "#6CB6E8", dark: "#2A5F85" },
  ocean: { hex: "#2F6FB0", dark: "#163A63" },
  cobalt: { hex: "#3D4FB8", dark: "#1C2566" },
  lilac: { hex: "#B49BDB", dark: "#5E4888" },
  grape: { hex: "#7B4FA8", dark: "#3D2459" },
  bubblegum: { hex: "#F28BB6", dark: "#933F64" },
  blush: { hex: "#F2B2A0", dark: "#94594B" },
  cocoa: { hex: "#8A5A3C", dark: "#45291A" },
  charcoal: { hex: "#3B3A40", dark: "#1A191D" },
  bone: { hex: "#EDE4D3", dark: "#8A7E68" },
} as const satisfies Record<ToyColor, { hex: string; dark: string }>;

// ---------------------------------------------------------------------------
// Phone drawing palette
// ---------------------------------------------------------------------------

/** The phone canvas, the stage easel and the server rasterizer all paint on this. */
export const DRAWING_CANVAS_HEX = "#F7F0E1";

/** Stroke colour index for the eraser (strokes.ts `c`). */
export const ERASER_INDEX = 6;

/**
 * Six ink colours plus the eraser, by stroke colour index. Each ink maps to a
 * toy colour so the doodle reads as the champion's palette; all six stay
 * readable on the cream canvas (no yellow or pastel inks).
 */
export const PHONE_PALETTE = [
  { index: 0, label: "Ink", toy: "charcoal", hex: TOY_COLOR_VALUES.charcoal.hex },
  { index: 1, label: "Red", toy: "tomato", hex: TOY_COLOR_VALUES.tomato.hex },
  { index: 2, label: "Orange", toy: "tangerine", hex: TOY_COLOR_VALUES.tangerine.hex },
  { index: 3, label: "Green", toy: "moss", hex: TOY_COLOR_VALUES.moss.hex },
  { index: 4, label: "Blue", toy: "ocean", hex: TOY_COLOR_VALUES.ocean.hex },
  { index: 5, label: "Purple", toy: "grape", hex: TOY_COLOR_VALUES.grape.hex },
  { index: ERASER_INDEX, label: "Eraser", toy: null, hex: DRAWING_CANVAS_HEX },
] as const satisfies readonly {
  index: number;
  label: string;
  toy: ToyColor | null;
  hex: string;
}[];

// ---------------------------------------------------------------------------
// Face
// ---------------------------------------------------------------------------

export const EYE_STYLES = [
  "round",
  "sleepy",
  "angry",
  "googly",
  "tiny",
  "cyclops",
  "many",
  "visor",
  "starry",
  "beady",
] as const;
export type EyeStyle = (typeof EYE_STYLES)[number];

/** Prompt-facing lines: what each eye decal looks like. */
export const EYE_STYLE_INFO = {
  round: "Two big round eyes with shiny highlights. The friendly default.",
  sleepy: "Two half-lidded eyes. Bored, drowsy or deeply unimpressed.",
  angry: "Two eyes under slanted brows. Furious about something.",
  googly: "Two mismatched googly eyes with loose pupils. Chaotic.",
  tiny: "Two small dot eyes set wide apart. Innocent or dim.",
  cyclops: "One huge central eye.",
  many: "A cluster of five or more small eyes. Spidery or alien.",
  visor: "A single glowing band across the face. Robots and knights.",
  starry: "Two eyes with star-shaped highlights. Starstruck or dazzled.",
  beady: "Two tiny shiny black eyes close together. Shifty, birdlike.",
} as const satisfies Record<EyeStyle, string>;

export const MOUTH_STYLES = [
  "smile",
  "grin",
  "fangs",
  "beak",
  "frown",
  "o",
  "tongue",
  "smug",
  "zigzag",
  "none",
] as const;
export type MouthStyle = (typeof MOUTH_STYLES)[number];

/** Prompt-facing lines: what each mouth decal looks like. */
export const MOUTH_STYLE_INFO = {
  smile: "A simple curved smile.",
  grin: "A wide toothy grin, ear to ear.",
  fangs: "A mouth with two pointed fangs. Predators and vampires.",
  beak: "A small pointed beak. Birds, squid, turtles.",
  frown: "A downturned frown. Grumpy or sad.",
  o: "A small round open mouth. Surprised or mid-shout.",
  tongue: "An open mouth with the tongue sticking out. Silly or rude.",
  smug: "A lopsided half smile. Knows something you don't.",
  zigzag: "A jagged stitched or zigzag mouth. Monsters and dolls.",
  none: "No mouth at all. Mysterious.",
} as const satisfies Record<MouthStyle, string>;

// ---------------------------------------------------------------------------
// Held items
// ---------------------------------------------------------------------------

export const PROP_TAGS = [
  "knife",
  "bat",
  "umbrella",
  "leaf_blower",
  "fish",
  "briefcase",
  "wand",
  "pan",
  "trumpet",
  "laptop",
  "rubber_chicken",
  "baguette",
  "guitar",
  "plunger",
  "sword",
  "shield",
  "mop",
  "phone",
  "spatula",
  "broom",
  "rolling_pin",
  "boxing_glove",
  "megaphone",
  "cactus",
  "balloon",
  "thing",
] as const;
export type PropTag = (typeof PROP_TAGS)[number];

/** How a prop reads and sounds: picks the impact family and the grip pose. */
export const PROP_KINDS = ["blade", "blunt", "soft", "gadget", "instrument", "guard"] as const;
export type PropKind = (typeof PROP_KINDS)[number];

/** Prompt-facing lines (match the drawing or text to the nearest tag) and each prop's kind. */
export const PROP_INFO = {
  knife: { kind: "blade", description: "A kitchen knife or dagger." },
  bat: { kind: "blunt", description: "A baseball bat, club or cudgel." },
  umbrella: { kind: "blunt", description: "A closed umbrella, parasol or cane." },
  leaf_blower: { kind: "gadget", description: "A leaf blower, hair dryer, fan or vacuum." },
  fish: { kind: "soft", description: "A whole floppy fish." },
  briefcase: { kind: "blunt", description: "A briefcase, suitcase, handbag or lunchbox." },
  wand: { kind: "gadget", description: "A magic wand, staff or sceptre." },
  pan: { kind: "blunt", description: "A frying pan, wok or pot." },
  trumpet: { kind: "instrument", description: "A trumpet, horn, saxophone or kazoo." },
  laptop: { kind: "gadget", description: "A laptop, tablet, book or clipboard." },
  rubber_chicken: { kind: "soft", description: "A rubber chicken or squeaky toy." },
  baguette: { kind: "soft", description: "A baguette, sausage or any long food." },
  guitar: { kind: "instrument", description: "A guitar, ukulele, violin or keytar." },
  plunger: { kind: "blunt", description: "A sink plunger or toilet brush." },
  sword: { kind: "blade", description: "A sword, sabre, axe or lightsaber-ish thing." },
  shield: { kind: "guard", description: "A shield, trash-can lid or pot lid." },
  mop: { kind: "blunt", description: "A mop, paintbrush or feather duster." },
  phone: { kind: "gadget", description: "A phone, remote control or walkie-talkie." },
  spatula: { kind: "blunt", description: "A spatula, ladle, spoon or fly swatter." },
  broom: { kind: "blunt", description: "A broom, rake, pitchfork or long pole." },
  rolling_pin: { kind: "blunt", description: "A rolling pin, baton or club-shaped tool." },
  boxing_glove: { kind: "soft", description: "A boxing glove, oven mitt or big foam hand." },
  megaphone: { kind: "gadget", description: "A megaphone, microphone or loudspeaker." },
  cactus: { kind: "blade", description: "A potted cactus or anything spiky to hold." },
  balloon: { kind: "soft", description: "A balloon, bubble wand or kite." },
  thing: {
    kind: "blunt",
    description: "A held object that matches no other tag. Shown as a lump in the accent colour.",
  },
} as const satisfies Record<PropTag, { kind: PropKind; description: string }>;
