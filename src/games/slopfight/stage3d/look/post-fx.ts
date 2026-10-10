// Director-driven post-effect state: letterbox bars, the iris, the accent
// wipe, the impact frame (one white flash frame + radial lines), chromatic
// aberration on impacts, and depth of field on hero shots. The director and
// the transitions write here; the post stack (post.tsx) reads it every frame.
// Plain mutable state, no React: it changes every frame.

import { Color, Vector2, Vector3, type Camera } from "three";

export interface PostToggles {
  bloom: boolean;
  dof: boolean;
  chromatic: boolean;
  smaa: boolean;
  grade: boolean;
  vignette: boolean;
  /** Letterbox, iris, wipe and impact frame. */
  stageFx: boolean;
}

export const ALL_POST_ON: PostToggles = {
  bloom: true,
  dof: true,
  chromatic: true,
  smaa: true,
  grade: true,
  vignette: true,
  stageFx: true,
};

/** Frames the radial lines stay up after an impact (the hit stop's four frozen frames). */
export const IMPACT_LINE_FRAMES = 4;

const projected = new Vector3();

/** World point to 0..1 screen uv (y up). Points behind the camera land off-screen. */
export function worldToUv(point: Vector3, camera: Camera, out: Vector2): Vector2 {
  projected.copy(point).project(camera);
  if (projected.z > 1) return out.set(0.5, -2);
  return out.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
}

export class PostFx {
  toggles: PostToggles = { ...ALL_POST_ON };

  /** Letterbox amount 0..1 (1 = full 2.39:1 bars), eased toward `letterboxTarget`. */
  letterbox = 0;
  letterboxTarget = 0;
  /** Seconds the bars take to travel fully. */
  letterboxSeconds = 0.45;

  /** Wipe progress 0..2: 0 clear, 1 fully covered, 2 cleared off the far side. */
  wipe = { progress: 0, color: new Color("#2a9d8f"), angle: 0.32 };

  /** Iris: radius as a fraction of screen height (>= 1.6 is fully open). */
  iris = {
    radius: 2,
    center: new Vector2(0.5, 0.5),
    color: new Color("#1b1020"),
    /** Tracked world point; projected to `center` each frame when set. */
    world: null as Vector3 | null,
  };

  /** Impact frame. `flash` is 1 for exactly one rendered frame. */
  impact = { flash: 0, lines: 0, center: new Vector2(0.5, 0.5), seed: 0 };
  private flashPending = false;
  private lineFrames = 0;
  private impactWorld: Vector3 | null = null;

  /** Chromatic aberration amount 0..1, spiked by impacts and decaying fast. */
  chromatic = 0;

  /** Depth of field: strength 0..1 eased toward the target; focus is a world point. */
  dof = { strength: 0, target: 0, focus: new Vector3(0, 0.6, 0) };

  /** Set the bars' target (0 or 1, or anything between). */
  setLetterbox(target: number, seconds = 0.45): void {
    this.letterboxTarget = Math.min(1, Math.max(0, target));
    this.letterboxSeconds = Math.max(0.01, seconds);
  }

  /** Hero-shot depth of field on a world point (strength 0 turns it off). */
  setDof(strength: number, focus?: Vector3): void {
    this.dof.target = Math.min(1, Math.max(0, strength));
    if (focus) this.dof.focus.copy(focus);
  }

  /**
   * One impact frame at a world point (or screen centre): a white flash frame,
   * radial lines for the hit stop, and a chromatic-aberration spike.
   */
  impactFrame(point: Vector3 | null, strength = 1): void {
    this.flashPending = true;
    this.lineFrames = IMPACT_LINE_FRAMES;
    this.impactWorld = point ? point.clone() : null;
    if (!point) this.impact.center.set(0.5, 0.5);
    this.impact.seed = (this.impact.seed + 1) % 997;
    this.chromatic = Math.min(1, Math.max(this.chromatic, 0.55 + 0.45 * strength));
  }

  /** Advance one rendered frame. Call after the camera has its final pose. */
  update(realDelta: number, camera: Camera): void {
    const step = realDelta / this.letterboxSeconds;
    const gap = this.letterboxTarget - this.letterbox;
    this.letterbox = Math.abs(gap) <= step ? this.letterboxTarget : this.letterbox + Math.sign(gap) * step;

    if (this.iris.world) worldToUv(this.iris.world, camera, this.iris.center);
    if (this.impactWorld) worldToUv(this.impactWorld, camera, this.impact.center);

    this.impact.flash = this.flashPending ? 1 : 0;
    this.flashPending = false;
    if (this.lineFrames > 0) {
      this.impact.lines = this.lineFrames / IMPACT_LINE_FRAMES;
      this.lineFrames -= 1;
    } else {
      this.impact.lines = 0;
    }

    this.chromatic = Math.max(0, this.chromatic - realDelta * 2.4);
    const dofGap = this.dof.target - this.dof.strength;
    this.dof.strength += dofGap * Math.min(1, realDelta * 4);
    if (Math.abs(dofGap) < 0.002) this.dof.strength = this.dof.target;
  }

  /** The bars' height as a fraction of the screen height, for 2.39:1 at full. */
  letterboxBarFraction(aspect: number): number {
    const full = Math.max(0, (1 - aspect / 2.39) / 2);
    return full * this.letterbox;
  }
}
