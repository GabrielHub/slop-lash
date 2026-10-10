// Five complete ForgeResults for the forge prompt's static block: a described
// biped with a held item, a hat (ears moved to the sides) and a belly; a drawn
// biped with a written name, one centred back-gear part and a suit marking; a
// tentacled flat-disc object; a rejection; and a lenient mark built as
// something other than a sphere with nubs. They model the <body> rules (tells
// at M to XL, limbs in the body's slot, legs normal, nothing on the face's
// front but a muzzle, one part kind per anchor, clothing as paint) and never
// use a probe or held-out subject.
// Fixed (never rotated) so the prefix stays cached; every one is already
// balanced and valid (tested).

import type { ForgeResult, Part } from "../sheet";

export interface ForgeExample {
  mode: "submit" | "lenient";
  /** What the player sent, as the prompt describes it. */
  input: string;
  result: ForgeResult;
}

type Spec = `${Part["role"]} ${Part["shape"]} ${Part["size"]} ${Part["elongation"]}`;

/** `spec` is "role shape size elongation"; `on` is "parent.anchor", null for the torso. */
function part(id: string, spec: Spec, on: string | null, color: Part["color"], mirror = false): Part {
  const [role, shape, size, elongation] = spec.split(" ") as [
    Part["role"],
    Part["shape"],
    Part["size"],
    Part["elongation"],
  ];
  const [parent, anchor] = on ? (on.split(".") as [string, Part["anchor"]]) : [null, null];
  return { id, role, shape, size, elongation, parent, anchor, color, mirror };
}

export const FORGE_EXAMPLES: readonly ForgeExample[] = [
  {
    mode: "submit",
    input:
      "Description: a grizzly bear park ranger in a big flat-brimmed hat who sweeps up litter with a broom and takes it very personally",
    result: {
      verdict: "FORGE",
      rejection: null,
      champion: {
        bodyPlan: "BIPED",
        palette: { primary: "cocoa", secondary: "sand", accent: "moss" },
        parts: [
          part("torso", "torso capsule L normal", null, "primary"),
          part("head", "head sphere M normal", "torso.top", "primary"),
          part("muzzle", "horn sphere L normal", "head.front", "primary"),
          part("ear", "ear sphere M normal", "head.left", "primary", true),
          part("brim", "fin sphere XL stubby", "head.top", "accent"),
          part("crown", "fin box M normal", "brim.top", "accent"),
          part("leg1", "leg capsule M normal", "torso.leg1", "primary"),
          part("leg2", "leg capsule M normal", "torso.leg2", "primary"),
          part("arm1", "arm capsule M normal", "torso.arm1", "primary"),
          part("arm2", "arm capsule M normal", "torso.arm2", "primary"),
          part("broom", "item capsule M normal", "arm2.bottom", "secondary"),
        ],
        markings: [{ part: "torso", kind: "belly", color: "secondary" }],
        face: { eyes: "sleepy", mouth: "frown" },
        item: "broom",
        stats: { heft: 4, reach: 3, chaos: 2 },
        moves: [
          { name: "Citation Swat", type: "STRIKE", power: 4, delivery: "item" },
          { name: "Bear Hug of the Law", type: "GRAPPLE", power: 3, delivery: "arm" },
          { name: "Leave No Trace", type: "TRICK", power: 2, delivery: "body" },
        ],
        traits: ["heavy", "fluffy", "stubborn"],
        temperament: { aggression: 0.55, caution: 0.5, showboating: 0.3 },
        name: "Ranger Bramble",
        bio: "A park ranger who has written 4,000 littering tickets, including one to the wind.",
        narration: {
          walkOn: [
            "Ranger Bramble has spotted litter. Your litter.",
            "Ranger Bramble tips the hat. Nobody tips back.",
          ],
          landHit: ["That's a fine, and Bramble is collecting!", "Swept clean!", "Leave no trace, says Bramble."],
          takeHit: ["The hat survives. The dignity, less so.", "Bramble files that under vandalism."],
          win: ["Ranger Bramble restores order to the park.", "The arena is now a protected area."],
          lose: ["Bramble is down. The litter wins today.", "Ranger Bramble has been swept."],
          ringOut: ["Bramble has left the trail!", "Off the path, ranger!"],
        },
      },
    },
  },
  {
    mode: "submit",
    input:
      "Drawing: an upright rabbit in charcoal outline with two tall ears, a charcoal jacket and tie scribbled over its body, a big tomato-red parachute pack on its back, a phone in one paw, and AGENT CLOVER written underneath.",
    result: {
      verdict: "FORGE",
      rejection: null,
      champion: {
        bodyPlan: "BIPED",
        palette: { primary: "bone", secondary: "charcoal", accent: "tomato" },
        parts: [
          part("torso", "torso capsule L normal", null, "primary"),
          part("head", "head sphere M normal", "torso.top", "primary"),
          part("ear", "ear capsule L long", "head.top", "primary", true),
          part("leg1", "leg capsule M normal", "torso.leg1", "primary"),
          part("leg2", "leg capsule M normal", "torso.leg2", "primary"),
          part("arm1", "arm capsule M normal", "torso.arm1", "primary"),
          part("arm2", "arm capsule M normal", "torso.arm2", "primary"),
          part("pack", "fin box L normal", "torso.back", "accent"),
          part("phone", "item box M normal", "arm2.bottom", "secondary"),
        ],
        markings: [{ part: "torso", kind: "suit", color: "secondary" }],
        face: { eyes: "beady", mouth: "smug" },
        item: "phone",
        stats: { heft: 2, reach: 3, chaos: 4 },
        moves: [
          { name: "Classified Kick", type: "STRIKE", power: 4, delivery: "leg" },
          { name: "Emergency Chute", type: "TRICK", power: 3, delivery: "body" },
          { name: "Need-to-Know Hold", type: "GRAPPLE", power: 2, delivery: "arm" },
        ],
        traits: ["sneaky", "nimble", "smug"],
        temperament: { aggression: 0.45, caution: 0.7, showboating: 0.35 },
        name: "Agent Clover",
        bio: "Licensed to hop. Has jumped from 40 planes and opened the parachute once, by accident.",
        narration: {
          walkOn: ["Agent Clover arrives. You never saw this.", "Clover checks the exits. Twice."],
          landHit: ["Classified, and it hurt!", "That kick is above your clearance.", "Agent Clover leaves no trace."],
          takeHit: ["The suit took that one.", "Clover's cover is blown!"],
          win: ["Mission complete. Clover was never here.", "Agent Clover hops off into the night."],
          lose: ["Agent Clover is down. Deny everything.", "The mission is scrubbed."],
          ringOut: ["Clover bails out! Chute, please!", "Agent Clover has left the building!"],
        },
      },
    },
  },
  {
    mode: "submit",
    input: "Description: a flying saucer that abducts garden gnomes with four dangly tentacles",
    result: {
      verdict: "FORGE",
      rejection: null,
      champion: {
        bodyPlan: "FLIER",
        palette: { primary: "teal", secondary: "lime", accent: "butter" },
        parts: [
          part("saucer", "torso sphere XL stubby", null, "primary"),
          part("dome", "head sphere M normal", "saucer.top", "secondary"),
          part("tent1", "tail cone M long", "saucer.bottom", "secondary"),
          part("tent2", "tail cone M long", "saucer.bottom", "secondary"),
          part("tent3", "tail cone M long", "saucer.bottom", "secondary"),
          part("tent4", "tail cone M long", "saucer.bottom", "secondary"),
        ],
        markings: [{ part: "saucer", kind: "band", color: "accent" }],
        face: { eyes: "cyclops", mouth: "grin" },
        item: null,
        stats: { heft: 2, reach: 4, chaos: 3 },
        moves: [
          { name: "Tractor Beam", type: "GRAPPLE", power: 4, delivery: "tail" },
          { name: "Probe Poke", type: "STRIKE", power: 3, delivery: "tail" },
          { name: "Crop Circle Spin", type: "TRICK", power: 2, delivery: "body" },
        ],
        traits: ["magnetic", "sneaky"],
        temperament: { aggression: 0.5, caution: 0.6, showboating: 0.4 },
        name: "The Gnomenapper",
        bio: "Has abducted 312 garden gnomes and returned none. Calls it research.",
        narration: {
          walkOn: ["The Gnomenapper descends. Hide your gnomes.", "It comes in peace. It leaves with gnomes."],
          landHit: ["Probed!", "Four tentacles, zero mercy!", "That one goes in the logbook."],
          takeHit: ["The saucer wobbles!", "The Gnomenapper's lights flicker."],
          win: ["Another specimen for the collection.", "The Gnomenapper beams up the win."],
          lose: ["The Gnomenapper is grounded.", "Mission failed. The gnomes are safe."],
          ringOut: ["The Gnomenapper has left orbit!", "Beamed right out of the arena!"],
        },
      },
    },
  },
  {
    mode: "submit",
    input: "Description: my landlord greg halvorsen. bald, evil, never fixes the heater",
    result: {
      verdict: "REJECT",
      rejection: {
        reason: "No real people, even landlords who have it coming.",
        suggestion: "Try a creature inspired by him: a bald, evil radiator?",
      },
      champion: null,
    },
  },
  {
    mode: "lenient",
    input: "Drawing: one lopsided tangerine triangle scrawled in a corner of the canvas. Nothing else.",
    result: {
      verdict: "FORGE",
      rejection: null,
      champion: {
        bodyPlan: "HOPPER",
        palette: { primary: "tangerine", secondary: "charcoal", accent: "bone" },
        parts: [
          part("torso", "torso cone L long", null, "primary"),
          part("arm1", "arm capsule M normal", "torso.arm1", "primary"),
          part("arm2", "arm capsule M normal", "torso.arm2", "primary"),
        ],
        markings: [{ part: "torso", kind: "tip", color: "secondary" }],
        face: { eyes: "googly", mouth: "grin" },
        item: null,
        stats: { heft: 2, reach: 2, chaos: 5 },
        moves: [
          { name: "Point Taken", type: "STRIKE", power: 4, delivery: "body" },
          { name: "Sharp Turn", type: "TRICK", power: 3, delivery: "body" },
          { name: "Corner Hug", type: "GRAPPLE", power: 2, delivery: "arm" },
        ],
        traits: ["spiky", "dramatic"],
        temperament: { aggression: 0.7, caution: 0.2, showboating: 0.8 },
        name: "Acute Angle",
        bio: "A lopsided triangle someone drew as the clock ran out. It has one point and intends to make it.",
        narration: {
          walkOn: ["A triangle enters. It has a point.", "Three sides, zero doubts."],
          landHit: ["Point made!", "Acute Angle gets right to the point!", "Ouch. That was the pointy end."],
          takeHit: ["Acute Angle is knocked obtuse.", "A dent in the hypotenuse!"],
          win: ["Acute Angle wins. Point proven.", "Geometry triumphs."],
          lose: ["Acute Angle has been rounded off.", "Out of shape, literally."],
          ringOut: ["Acute Angle has gone off the page!", "Triangle overboard!"],
        },
      },
    },
  },
];
