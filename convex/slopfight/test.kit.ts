// Test fixtures for the SlopFight backend tests. The second dot in the file
// name keeps it out of the Convex push.
import type { Champion, ForgeResult } from "../../src/games/slopfight/sheet";
import type { AiCallRow } from "../jobs";
import type { FightOutcome } from "./ports";

/** A small, valid, balanced champion (stats and powers sum to 9). */
export function sampleChampion(name = "Gerald"): Champion {
  return {
    bodyPlan: "BIPED",
    palette: { primary: "tomato", secondary: "butter", accent: "teal" },
    parts: [
      {
        id: "torso",
        role: "torso",
        shape: "capsule",
        size: "M",
        elongation: "normal",
        parent: null,
        anchor: null,
        color: "primary",
        mirror: false,
      },
      {
        id: "head",
        role: "head",
        shape: "sphere",
        size: "M",
        elongation: "normal",
        parent: "torso",
        anchor: "top",
        color: "secondary",
        mirror: false,
      },
      {
        id: "leg1",
        role: "leg",
        shape: "capsule",
        size: "S",
        elongation: "normal",
        parent: "torso",
        anchor: "leg1",
        color: "primary",
        mirror: false,
      },
      {
        id: "leg2",
        role: "leg",
        shape: "capsule",
        size: "S",
        elongation: "normal",
        parent: "torso",
        anchor: "leg2",
        color: "primary",
        mirror: false,
      },
    ],
    face: { eyes: "round", mouth: "grin" },
    item: null,
    stats: { heft: 3, reach: 3, chaos: 3 },
    moves: [
      { name: "Bonk", type: "STRIKE", power: 3, delivery: "arm" },
      { name: "Hug", type: "GRAPPLE", power: 3, delivery: "arm" },
      { name: "Fake Sneeze", type: "TRICK", power: 3, delivery: "head" },
    ],
    traits: ["smug", "sticky"],
    temperament: { aggression: 0.5, caution: 0.5, showboating: 0.5 },
    name,
    bio: `${name} came to win.`,
    narration: {
      walkOn: [`${name} walks on.`, `${name} is here.`],
      landHit: ["Bonk.", "Got you.", "Again."],
      takeHit: ["Oof.", "Rude."],
      win: ["Easy.", "Next."],
      lose: ["Ugh.", "Later."],
      ringOut: ["Bye!", "Splash."],
    },
  };
}

export function forgeResult(champion: Champion): ForgeResult {
  return {
    verdict: "FORGE",
    rejection: null,
    champion: { ...champion, markings: champion.markings ?? [] },
  };
}

export function rejectResult(reason = "That looks like a real person."): ForgeResult {
  return {
    verdict: "REJECT",
    rejection: { reason, suggestion: "Try a creature." },
    champion: null,
  };
}

/** One `aiCalls` row as the task layer would record it. */
export function aiCall(modelId: string, ok = true, task = "slopfight.forge"): AiCallRow {
  return {
    task,
    promptVersion: 1,
    modelId,
    ok,
    failReason: ok ? null : "provider-error",
    finishReason: ok ? "stop" : null,
    latencyMs: 1200,
    attempts: 1,
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 100,
      costUsd: 0.01,
      cachePriceKnown: true,
    },
    createdAt: Date.now(),
  };
}

/** A decisive sim outcome: A knocks B out at 12 s. */
export function sampleOutcome(overrides: Partial<FightOutcome> = {}): FightOutcome {
  return {
    winner: "A",
    method: "KO",
    endMs: 12_000,
    health: { A: 41, B: 0 },
    maxHealth: { A: 110, B: 110 },
    events: [
      { t: 0, kind: "start", side: null },
      { t: 900, kind: "windup", side: "A", move: 0, type: "STRIKE" },
      {
        t: 1_000,
        kind: "hit",
        side: "A",
        move: 0,
        type: "STRIKE",
        damage: 30,
        knockback: 4,
        big: true,
        point: [0, 1, 0],
        health: 80,
        counter: false,
        miracle: false,
      },
      { t: 12_000, kind: "ko", side: "B" },
      { t: 12_000, kind: "end", side: "A", method: "KO" },
    ],
    healthTimeline: [
      [0, 110, 110],
      [1_000, 110, 80],
      [12_000, 41, 0],
    ],
    hash: "cafef00d",
    ...overrides,
  };
}
