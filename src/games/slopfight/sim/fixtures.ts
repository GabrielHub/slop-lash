// Sim-local champion fixtures: one or more per body plan, balanced, used by
// the sim tests and as a fallback for the tuner. The shared sample set in
// ../samples.ts (Creature workstream) is the main tuning field.

import { balanceChampion, type Champion, type Part } from "../sheet";

type P = [
  id: string,
  role: Part["role"],
  shape: Part["shape"],
  size: Part["size"],
  elongation: Part["elongation"],
  parent: string | null,
  anchor: Part["anchor"],
  color?: Part["color"],
  mirror?: boolean,
];

const parts = (list: P[]): Part[] =>
  list.map(([id, role, shape, size, elongation, parent, anchor, color = "primary", mirror = false]) => ({
    id,
    role,
    shape,
    size,
    elongation,
    parent,
    anchor,
    color,
    mirror,
  }));

const NARRATION: Champion["narration"] = {
  walkOn: ["Here it comes.", "It has arrived."],
  landHit: ["Got one in.", "Bonk.", "That landed."],
  takeHit: ["Oof.", "That stung."],
  win: ["Victory.", "Too easy."],
  lose: ["Down it goes.", "Next time."],
  ringOut: ["Gone!", "Over the edge!"],
};

type Spec = Omit<Champion, "palette" | "face" | "narration" | "bio"> & { bio?: string };

const make = (spec: Spec): Champion =>
  balanceChampion({
    palette: { primary: "tomato", secondary: "butter", accent: "sky" },
    face: { eyes: "round", mouth: "grin" },
    narration: NARRATION,
    bio: spec.bio ?? spec.name,
    ...spec,
  } as Champion);

export interface SimFixture {
  id: string;
  champion: Champion;
}

export const SIM_FIXTURES: SimFixture[] = [
  {
    id: "raccoon",
    champion: make({
      name: "Litigator Raccoon",
      bodyPlan: "BIPED",
      parts: parts([
        ["torso", "torso", "capsule", "M", "normal", null, null],
        ["head", "head", "sphere", "M", "normal", "torso", "top"],
        ["leg1", "leg", "capsule", "S", "normal", "torso", "leg1"],
        ["leg2", "leg", "capsule", "S", "normal", "torso", "leg2"],
        ["arm1", "arm", "capsule", "S", "normal", "torso", "arm1"],
        ["arm2", "arm", "capsule", "S", "normal", "torso", "arm2"],
        ["case", "item", "box", "S", "normal", "arm2", "bottom", "accent"],
        ["tail", "tail", "capsule", "S", "long", "torso", "back", "secondary"],
        ["ear", "ear", "cone", "S", "stubby", "head", "left", "primary", true],
      ]),
      item: "briefcase",
      stats: { heft: 3, reach: 3, chaos: 3 },
      moves: [
        { name: "Briefcase Bonk", type: "STRIKE", power: 4, delivery: "item" },
        { name: "Objection Shove", type: "GRAPPLE", power: 3, delivery: "arm" },
        { name: "Billable Sidestep", type: "TRICK", power: 2, delivery: "leg" },
      ],
      traits: ["armed", "sneaky"],
      temperament: { aggression: 0.6, caution: 0.4, showboating: 0.3 },
    }),
  },
  {
    id: "dog",
    champion: make({
      name: "Good Boy Supreme",
      bodyPlan: "QUADRUPED",
      parts: parts([
        ["torso", "torso", "capsule", "L", "normal", null, null],
        ["head", "head", "sphere", "M", "normal", "torso", "front"],
        ["leg1", "leg", "capsule", "S", "normal", "torso", "leg1"],
        ["leg2", "leg", "capsule", "S", "normal", "torso", "leg2"],
        ["leg3", "leg", "capsule", "S", "normal", "torso", "leg3"],
        ["leg4", "leg", "capsule", "S", "normal", "torso", "leg4"],
        ["tail", "tail", "capsule", "S", "normal", "torso", "back"],
        ["ear", "ear", "capsule", "S", "stubby", "head", "left", "secondary", true],
      ]),
      item: null,
      stats: { heft: 3, reach: 2, chaos: 4 },
      moves: [
        { name: "Zoomies Ram", type: "STRIKE", power: 3, delivery: "head" },
        { name: "Chomp and Shake", type: "GRAPPLE", power: 4, delivery: "head" },
        { name: "Play Dead", type: "TRICK", power: 2, delivery: "body" },
      ],
      traits: ["relentless", "loud"],
      temperament: { aggression: 0.8, caution: 0.2, showboating: 0.4 },
    }),
  },
  {
    id: "spider",
    champion: make({
      name: "Eightfold Menace",
      bodyPlan: "MULTIPED",
      parts: parts([
        ["torso", "torso", "sphere", "L", "normal", null, null],
        ["head", "head", "sphere", "M", "stubby", "torso", "front"],
        ...[1, 2, 3, 4, 5, 6, 7, 8].map(
          (n): P => [`leg${n}`, "leg", "capsule", "S", "long", "torso", `leg${n}` as Part["anchor"], "secondary"],
        ),
      ]),
      item: null,
      stats: { heft: 2, reach: 4, chaos: 3 },
      moves: [
        { name: "Fang Jab", type: "STRIKE", power: 3, delivery: "head" },
        { name: "Web Wrap", type: "GRAPPLE", power: 4, delivery: "leg" },
        { name: "Skitter Feint", type: "TRICK", power: 2, delivery: "leg" },
      ],
      traits: ["venomous", "sneaky", "nimble"],
      temperament: { aggression: 0.5, caution: 0.6, showboating: 0.1 },
    }),
  },
  {
    id: "potato",
    champion: make({
      name: "Spud Bud",
      bodyPlan: "HOPPER",
      parts: parts([
        ["torso", "torso", "sphere", "L", "normal", null, null],
        ["eye", "spike", "sphere", "S", "stubby", "torso", "front", "accent"],
      ]),
      item: null,
      stats: { heft: 4, reach: 1, chaos: 4 },
      moves: [
        { name: "Mash Landing", type: "STRIKE", power: 5, delivery: "body" },
        { name: "Starch Hug", type: "GRAPPLE", power: 2, delivery: "body" },
        { name: "Roll Away", type: "TRICK", power: 2, delivery: "body" },
      ],
      traits: ["bouncy", "stubborn"],
      temperament: { aggression: 0.7, caution: 0.2, showboating: 0.5 },
    }),
  },
  {
    id: "jellyfish",
    champion: make({
      name: "Very Confident Jelly",
      bodyPlan: "SLITHER",
      parts: parts([
        ["torso", "torso", "sphere", "L", "normal", null, null],
        ["t1", "tail", "capsule", "S", "long", "torso", "back", "secondary"],
        ["t2", "tail", "capsule", "S", "long", "t1", "back", "secondary"],
        ["t3", "tail", "capsule", "S", "normal", "t2", "back", "secondary"],
      ]),
      item: null,
      stats: { heft: 1, reach: 3, chaos: 5 },
      moves: [
        { name: "Sting Slap", type: "STRIKE", power: 3, delivery: "tail" },
        { name: "Smug Wobble", type: "TRICK", power: 4, delivery: "body" },
        { name: "Tendril Tangle", type: "GRAPPLE", power: 2, delivery: "tail" },
      ],
      traits: ["smug", "slippery", "fragile"],
      temperament: { aggression: 0.4, caution: 0.3, showboating: 0.9 },
    }),
  },
  {
    id: "cloud",
    champion: make({
      name: "Cumulus Maximus",
      bodyPlan: "FLIER",
      parts: parts([
        ["torso", "torso", "sphere", "L", "normal", null, null],
        ["puff", "spike", "sphere", "M", "normal", "torso", "top", "secondary"],
        ["wing", "wing", "capsule", "M", "normal", "torso", "left", "secondary", true],
        ["foot", "leg", "capsule", "S", "stubby", "torso", "leg1"],
        ["foot2", "leg", "capsule", "S", "stubby", "torso", "leg2"],
      ]),
      item: null,
      stats: { heft: 2, reach: 3, chaos: 4 },
      moves: [
        { name: "Thunder Clap", type: "STRIKE", power: 4, delivery: "body" },
        { name: "Fog Bank", type: "TRICK", power: 3, delivery: "body" },
        { name: "Drizzle Hug", type: "GRAPPLE", power: 2, delivery: "body" },
      ],
      traits: ["electric", "fluffy"],
      temperament: { aggression: 0.5, caution: 0.5, showboating: 0.4 },
    }),
  },
  {
    id: "robot",
    champion: make({
      name: "Unit 9 Heavy",
      bodyPlan: "BIPED",
      parts: parts([
        ["torso", "torso", "box", "XL", "normal", null, null],
        ["head", "head", "box", "M", "stubby", "torso", "top"],
        ["leg1", "leg", "capsule", "M", "stubby", "torso", "leg1"],
        ["leg2", "leg", "capsule", "M", "stubby", "torso", "leg2"],
        ["arm1", "arm", "capsule", "M", "normal", "torso", "arm1"],
        ["arm2", "arm", "capsule", "M", "normal", "torso", "arm2"],
        ["antenna", "horn", "capsule", "S", "long", "head", "top", "accent"],
      ]),
      item: null,
      stats: { heft: 5, reach: 3, chaos: 1 },
      moves: [
        { name: "Piston Punch", type: "STRIKE", power: 4, delivery: "arm" },
        { name: "Hydraulic Hug", type: "GRAPPLE", power: 4, delivery: "arm" },
        { name: "Reboot Feint", type: "TRICK", power: 1, delivery: "body" },
      ],
      traits: ["heavy", "metallic", "armored"],
      temperament: { aggression: 0.5, caution: 0.5, showboating: 0.1 },
    }),
  },
  {
    id: "mouse",
    champion: make({
      name: "Squeak Fury",
      bodyPlan: "BIPED",
      parts: parts([
        ["torso", "torso", "capsule", "S", "normal", null, null],
        ["head", "head", "sphere", "M", "normal", "torso", "top"],
        ["leg1", "leg", "capsule", "S", "stubby", "torso", "leg1"],
        ["leg2", "leg", "capsule", "S", "stubby", "torso", "leg2"],
        ["arm1", "arm", "capsule", "S", "stubby", "torso", "arm1"],
        ["arm2", "arm", "capsule", "S", "stubby", "torso", "arm2"],
        ["sword", "item", "capsule", "S", "long", "arm1", "bottom", "accent"],
        ["tail", "tail", "capsule", "S", "long", "torso", "back", "secondary"],
        ["ear", "ear", "sphere", "M", "normal", "head", "left", "secondary", true],
      ]),
      item: "sword",
      stats: { heft: 1, reach: 4, chaos: 4 },
      moves: [
        { name: "Needle Lunge", type: "STRIKE", power: 4, delivery: "item" },
        { name: "Cheese Dash", type: "TRICK", power: 3, delivery: "leg" },
        { name: "Tiny Tackle", type: "GRAPPLE", power: 2, delivery: "body" },
      ],
      traits: ["tiny", "caffeinated", "cowardly"],
      temperament: { aggression: 0.7, caution: 0.5, showboating: 0.3 },
    }),
  },
];

export function simFixture(id: string): Champion {
  const found = SIM_FIXTURES.find((fixture) => fixture.id === id);
  if (!found) throw new Error(`no sim fixture ${id}`);
  return found.champion;
}
