"use client";

// The fight workstream's phase scenes (FACE_OFF, FIGHT, RESULT) and the
// recap's replay reel. Registered in scenes/registry.ts; the FINISHED scene
// renders RecapReel in the recap (viewer null, input.live false).

export { FaceOffScene } from "./faceoff-scene";
export { FightScene } from "./fight-scene";
export { ResultScene } from "./result-scene";
export { RecapReel } from "./recap-reel";
