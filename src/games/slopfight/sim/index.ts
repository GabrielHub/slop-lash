// SlopFight's deterministic fight sim (build plan contract 3.4). No DOM, no
// three.js, no React: the same module runs in a Convex Node action (the
// canonical outcome), in the browser stage (live playback) and in vitest.

export { loadRapier, type Rapier } from "./rapier";
export { createFight, runFight } from "./fight";
export { buildProxyDef, layoutOf, type ProxyDef } from "./proxy";
export { FIGHT_EVENT_KINDS } from "./types";
export type {
  FightEvent,
  FightEventKind,
  FightInput,
  FightMethod,
  FightOutcome,
  FightSim,
  FighterAnimHint,
  FighterLayout,
  FighterLive,
  FighterPose,
  Intent,
  Locomotion,
  MovePhase,
  ProxyBody,
  ProxyShape,
  Quat,
  Side,
  StaggerCause,
  Vec3,
  WhiffReason,
} from "./types";
export { STEP_HZ, STEP_MS } from "./tuning";
