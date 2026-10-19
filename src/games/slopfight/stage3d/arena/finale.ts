// The arena finale as the stage shows it (arenas.ts `finaleFor`): the kitchen
// counter tipping, the garage flooding, the rooftop storm. The fight's
// conductor publishes one small state per stage every frame from the
// presented sim time (frozen at the fight's end, like the sim); the set, the
// contact shadows, the post grade, the storm and the fighters read it. When
// the fight lets go (the phase moves on) it eases back to calm.
//
// The kitchen's tilt is a rotation about the axis through the counter top's
// centre, downhill edge down. The sim keeps its floor flat, so everything the
// sim places on the counter (fighters, their effects, camera targets) goes
// through `placeOnStage`, which tips it with the counter. A body that falls
// off fades out of the tilt as it drops (`tiltWeight`), so it lands on the
// kitchen floor where the sim has it.

import { Quaternion, Vector3, type BufferGeometry, type Mesh, type Object3D, type ShaderMaterial } from "three";
import {
  ARENAS,
  dryHalfAt,
  finaleStrengthAt,
  stormWindAt,
  type ArenaGeometry,
  type ArenaId,
  type Finale,
  type FinaleSpec,
  type Wind,
} from "../../arenas";
import { floodRiseAt, waterSurfaceAt } from "./flood-level";

export interface StageFinale {
  /** The arena whose finale this is; null when calm. */
  arena: ArenaId | null;
  spec: FinaleSpec | null;
  /** 0..1: the sim's strength while a fight drives it, then easing back to 0. */
  strength: number;
  /** Unit push on the floor plane: the tilt's downhill, the storm's downwind (0, 0 for the flood). */
  dirX: number;
  dirZ: number;
  /** The storm's wind strength (1 = a base gust; `stormWindAt`), 0 otherwise. */
  wind: number;
  /** Sim ms since the finale started (negative before it). One-shot beats key off it. */
  sinceMs: number;
  /** A fight published this frame's state. */
  driven: boolean;
}

/** The finale's title slam: "TIP OVER!", "HIGH TIDE!", "THE STORM!". */
export function finaleSlamText(spec: FinaleSpec): string {
  return `${spec.title.toUpperCase()}!`;
}

export function createStageFinale(): StageFinale {
  return { arena: null, spec: null, strength: 0, dirX: 0, dirZ: 0, wind: 0, sinceMs: -1, driven: false };
}

/**
 * The fight's finale at presented sim time `tMs`. Once the fight is decided
 * the strength holds where it was at `endMs`, exactly like the sim; the
 * rooftop's gusts keep blowing.
 */
export function publishFinale(
  state: StageFinale,
  arena: ArenaId,
  finale: Finale,
  wind: Wind | null,
  tMs: number,
  endMs: number | null,
): void {
  const at = endMs === null ? tMs : Math.min(tMs, endMs);
  state.arena = arena;
  state.spec = finale.spec;
  state.strength = finaleStrengthAt(finale, at);
  state.dirX = finale.direction?.[0] ?? 0;
  state.dirZ = finale.direction?.[1] ?? 0;
  state.wind = wind && finale.spec.id === "storm" ? stormWindAt(wind, finale.spec, state.strength, Math.max(0, tMs)) : 0;
  state.sinceMs = tMs - finale.startMs;
  state.driven = true;
}

/** Seconds (time constant) the finale takes to ease off once no fight drives it. */
const RELAX_S = 0.16;

/** No fight drives the finale: ease it back to calm (under the next phase's wipe). */
export function relaxFinale(state: StageFinale, realDelta: number): void {
  if (state.driven || !state.spec) return;
  state.strength *= Math.exp(-realDelta / RELAX_S);
  state.wind *= Math.exp(-realDelta / RELAX_S);
  state.sinceMs += realDelta * 1000;
  if (state.strength < 0.002) {
    state.strength = 0;
    state.spec = null;
    state.arena = null;
    state.wind = 0;
  }
}

/** Calm at once, no easing (a cut under a wipe's cover: RESULT's replay handing back the stage). */
export function calmFinale(state: StageFinale): void {
  Object.assign(state, createStageFinale());
}

// ---------------------------------------------------------------------------
// The tilt (Kitchen Counter)
// ---------------------------------------------------------------------------

/** The counter lurches as it gives way: a short decaying shudder on top of the sim's smooth ramp. */
const SHUDDER = { amplitude: 0.022, hz: 6.5, decayMs: 380, lengthMs: 1_500 };

/** The counter's tilt now, radians (positive: the downhill edge down). */
export function tiltAngle(state: StageFinale): number {
  const spec = state.spec;
  if (!spec || spec.id !== "tilt") return 0;
  let angle = spec.angle * state.strength;
  const since = state.sinceMs;
  if (state.driven && since >= 0 && since < SHUDDER.lengthMs) {
    angle += SHUDDER.amplitude * Math.sin((since / 1000) * SHUDDER.hz * Math.PI * 2) * Math.exp(-since / SHUDDER.decayMs);
  }
  return angle;
}

/** A point at sim height `y` tips with the counter while on or just under it, and leaves the tilt as it falls away. */
export function tiltWeight(y: number): number {
  const top = -0.45;
  const bottom = -2.6;
  if (y >= top) return 1;
  if (y <= bottom) return 0;
  const x = (y - bottom) / (top - bottom);
  return x * x * (3 - 2 * x);
}

const tmpAxis = new Vector3();
const tmpPivot = new Vector3();
const tmpQ = new Quaternion();

/** The counter's rotation scaled by `weight` (identity when nothing tips). */
export function tiltQuaternion(state: StageFinale, weight: number, out: Quaternion): Quaternion {
  const angle = tiltAngle(state) * weight;
  if (angle === 0) return out.identity();
  // up x downhill: rotating about it by +angle takes the downhill edge down.
  tmpAxis.set(state.dirZ, 0, -state.dirX);
  if (tmpAxis.lengthSq() < 1e-9) return out.identity();
  return out.setFromAxisAngle(tmpAxis.normalize(), angle);
}

/** The pivot of the tilt: the counter top's centre. */
export function tiltPivot(state: StageFinale, out: Vector3): Vector3 {
  const geometry = state.arena ? ARENAS[state.arena].geometry : null;
  return out.set(0, geometry?.topY ?? 0, 0);
}

/** A sim-space point to where the stage draws it (in place): tipped with the counter, by its own height. */
export function placeOnStage(state: StageFinale, p: Vector3): Vector3 {
  if (tiltAngle(state) === 0) return p;
  tiltQuaternion(state, tiltWeight(p.y), tmpQ);
  tiltPivot(state, tmpPivot);
  return p.sub(tmpPivot).applyQuaternion(tmpQ).add(tmpPivot);
}

/** The transform for a body whose torso is at sim height `torsoY` (its whole group tips together). */
export function tiltBody(state: StageFinale, torsoY: number, position: Vector3, quaternion: Quaternion): void {
  tiltQuaternion(state, tiltWeight(torsoY), quaternion);
  // position = pivot - q * pivot, so the group rotates about the pivot.
  tiltPivot(state, tmpPivot);
  position.copy(tmpPivot).applyQuaternion(quaternion).negate().add(tmpPivot);
}

// ---------------------------------------------------------------------------
// The flood (Flooded Garage)
// ---------------------------------------------------------------------------

/** The dry floor's half-size now (the sim's `dryHalfAt`), or the pad's when there is no flood. */
export function floodDryHalf(state: StageFinale, geometry: ArenaGeometry): number {
  const spec = state.spec;
  if (!spec || spec.id !== "flood") return geometry.halfSize;
  return dryHalfAt(geometry, spec, state.strength);
}

/** How far the surround has risen (m). It runs ahead of the sheet, so the pad's sides go under first. */
export function floodRise(state: StageFinale): number {
  return state.spec?.id === "flood" ? floodRiseAt(state.strength) : 0;
}

/** The water's surface height at (x, z): the flood sheet over the pad, else the surround. */
export function waterLevelAt(state: StageFinale, geometry: ArenaGeometry, x: number, z: number): number {
  const flood = state.spec?.id === "flood" ? state.spec : null;
  return waterSurfaceAt(geometry, flood, state.strength, x, z);
}

// ---------------------------------------------------------------------------
// The storm (Rooftop)
// ---------------------------------------------------------------------------

/** Lightning strikes after the storm starts (ms, brightness): a double crack at the start, then flickers. */
const STRIKES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [170, 0.75],
  [2_950, 0.5],
  [3_080, 0.35],
  [6_200, 0.6],
  [8_650, 0.45],
  [8_780, 0.55],
];
/** After the table, a strike every this many ms (sudden death). */
const STRIKE_REPEAT_MS = 3_700;
const STRIKE_DECAY_MS = 110;

/** Lightning brightness 0..1 at `sinceMs` into the storm. */
export function lightningAt(sinceMs: number): number {
  if (sinceMs < 0) return 0;
  const flash = (at: number, brightness: number) => {
    const age = sinceMs - at;
    return age < 0 ? 0 : brightness * Math.exp(-age / STRIKE_DECAY_MS);
  };
  let value = 0;
  for (const [at, brightness] of STRIKES) value = Math.max(value, flash(at, brightness));
  const last = STRIKES[STRIKES.length - 1]![0] + 1_200;
  if (sinceMs > last) {
    const phase = (sinceMs - last) % STRIKE_REPEAT_MS;
    value = Math.max(value, flash(sinceMs - phase, 0.5), flash(sinceMs - phase + 130, 0.4));
  }
  return value < 0.01 ? 0 : value;
}

/** The storm's look now: `dim` darkens and cools the grade, `flash` is the lightning. */
export function stormLook(state: StageFinale): { dim: number; flash: number } {
  if (state.spec?.id !== "storm") return { dim: 0, flash: 0 };
  const flash = lightningAt(state.sinceMs) * (state.driven ? 1 : state.strength);
  return { dim: state.strength, flash };
}

// ---------------------------------------------------------------------------
// The set's finale pieces
// ---------------------------------------------------------------------------

export interface FinaleSetAnimator {
  /** Run after the set's idle animations (the floaters bob from their rest each frame). */
  update(state: StageFinale): void;
  reset(): void;
}

interface Rest {
  object: Object3D;
  position: Vector3;
  quaternion: Quaternion;
}

/** The counter pieces that tip: the top, its edge band (and edge lights), the crumbs and the sink basin. */
const TILTED = new Set(["Floor", "Edge", "Set_Crumbs", "Pit"]);
/** The crumbs slide this far downhill at full tilt (decor: never past the edge). */
const CRUMB_SLIDE = 0.45;

const rest = (object: Object3D): Rest => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone() });

/**
 * The set's half of the finale. Kitchen: the counter pieces tip. Garage: the
 * surround water (with its ripples and floaters) rises, and `sheet` (the
 * flood over the pad, cut at the dry line) shows. Rooftop: nothing here (the
 * storm draws itself; the laundry follows `services.wind`).
 */
export function createFinaleSetAnimator(root: Object3D, arena: ArenaId, sheet: Mesh<BufferGeometry, ShaderMaterial> | null): FinaleSetAnimator {
  const spec = ARENAS[arena].finale;
  const geometry = ARENAS[arena].geometry;
  const tipped: Rest[] = [];
  const waters: Rest[] = [];
  const floaters: Object3D[] = [];
  root.traverse((object) => {
    if (spec.id === "tilt" && TILTED.has(object.name) && object.parent === root) tipped.push(rest(object));
    if (spec.id === "flood") {
      // Its ripples are a child and ride along.
      if (object.name === "Hazard_Water") waters.push(rest(object));
      else if (/^Floater_\d+$/.test(object.name)) floaters.push(object);
    }
  });
  const crumbs = tipped.find((piece) => piece.object.name === "Set_Crumbs") ?? null;
  const all: Rest[] = [...tipped, ...waters];
  const q = new Quaternion();
  const pivot = new Vector3();
  const offset = new Vector3();
  if (sheet) sheet.visible = false;

  return {
    update(state) {
      const ours = state.arena === arena;
      if (spec.id === "tilt") {
        if (ours) tiltQuaternion(state, 1, q);
        else q.identity();
        tiltPivot(state, pivot);
        for (const piece of tipped) {
          offset.copy(piece.position).sub(pivot);
          if (piece === crumbs && ours) {
            const s = state.strength;
            offset.x += state.dirX * CRUMB_SLIDE * s * s;
            offset.z += state.dirZ * CRUMB_SLIDE * s * s;
          }
          piece.object.position.copy(offset.applyQuaternion(q)).add(pivot);
          piece.object.quaternion.copy(q).multiply(piece.quaternion);
        }
        return;
      }
      if (spec.id === "flood") {
        const rise = ours ? floodRise(state) : 0;
        for (const water of waters) water.object.position.y = water.position.y + rise;
        // The floaters bob from their rest (hazards.ts) first; they ride the rise.
        for (const floater of floaters) floater.position.y += rise;
        if (sheet) {
          const dry = ours ? floodDryHalf(state, geometry) : geometry.halfSize;
          sheet.visible = ours && state.strength > 0 && dry < geometry.halfSize - 0.005;
          sheet.material.uniforms.uDry!.value = dry;
          sheet.material.uniforms.uFoam!.value = ours ? Math.min(1, state.strength * 6) : 0;
        }
      }
    },
    reset() {
      for (const piece of all) {
        piece.object.position.copy(piece.position);
        piece.object.quaternion.copy(piece.quaternion);
      }
      if (sheet) sheet.visible = false;
    },
  };
}
