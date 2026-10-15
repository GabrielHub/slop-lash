// Quality tiers. The stage targets 60 fps at 1080p on the development machine
// and 30 fps on a budget Chromebook or smart-TV browser. When it cannot keep
// up, it gives things back in the spec's order (section 7, Performance
// budget): post effects first, shadow resolution second, mesh resolution
// third. The ladder below is that order, one rung at a time; `?quality=`
// pins a tier, otherwise the stage starts on `high` and steps down a rung
// whenever frame time stays over budget. It never steps back up by itself
// (no oscillation mid-show).

export const QUALITY_TIERS = ["high", "medium", "low"] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

/** Post stack weight. full: bloom, DoF, CA, SMAA. reduced: light bloom only. minimal: no bloom. */
export type PostLevel = "full" | "reduced" | "minimal";
/** The Creature mesher's resolution tier. */
export type MeshResolution = "high" | "medium" | "low";

export interface QualitySettings {
  tier: QualityTier;
  /** 0 = best; each rung gives one thing back. */
  level: number;
  post: PostLevel;
  /** Shadow map size for the key light. */
  shadowMapSize: number;
  /** Contact shadow render-target size. */
  contactShadowSize: number;
  /** Marching-cubes grid for the creature mesher: while growing, and the final mesh. */
  meshResolution: MeshResolution;
  meshGrid: { growing: number; final: number };
  /** Upper bound on the canvas pixel ratio. */
  maxDpr: number;
}

/**
 * Rungs in degrade order. Rung 1 drops the heavy post effects (DoF, chromatic
 * aberration, SMAA, mip bloom), rung 2 drops bloom and halves the shadow map,
 * rung 3 halves it again and lowers the mesh resolution. The transition
 * effects (letterbox, iris, wipe, impact frame), tone mapping, grade and
 * vignette are one cheap pass and stay on every rung.
 */
export const QUALITY_LADDER: readonly QualitySettings[] = [
  {
    tier: "high",
    level: 0,
    post: "full",
    shadowMapSize: 2048,
    contactShadowSize: 512,
    meshResolution: "high",
    meshGrid: { growing: 48, final: 64 },
    maxDpr: 2,
  },
  {
    tier: "medium",
    level: 1,
    post: "reduced",
    shadowMapSize: 2048,
    contactShadowSize: 512,
    meshResolution: "high",
    meshGrid: { growing: 48, final: 64 },
    maxDpr: 1.5,
  },
  {
    tier: "medium",
    level: 2,
    post: "minimal",
    shadowMapSize: 1024,
    contactShadowSize: 256,
    meshResolution: "high",
    meshGrid: { growing: 48, final: 64 },
    maxDpr: 1.5,
  },
  {
    tier: "low",
    level: 3,
    post: "minimal",
    shadowMapSize: 512,
    contactShadowSize: 256,
    meshResolution: "low",
    meshGrid: { growing: 32, final: 40 },
    maxDpr: 1,
  },
];

/** The rung a pinned tier starts on. */
export const TIER_LEVEL: Readonly<Record<QualityTier, number>> = { high: 0, medium: 1, low: 3 };

export function settingsForLevel(level: number): QualitySettings {
  const index = Math.min(Math.max(Math.round(level), 0), QUALITY_LADDER.length - 1);
  return QUALITY_LADDER[index]!;
}

/** `?quality=high|medium|low` pins a tier; anything else (or nothing) is auto. */
export function parseQualityParam(search: string | URLSearchParams | null | undefined): QualityTier | null {
  if (!search) return null;
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const value = params.get("quality");
  return value && (QUALITY_TIERS as readonly string[]).includes(value) ? (value as QualityTier) : null;
}

export interface FrameBudgetOptions {
  /** Frame time (ms) the median must stay under. 20 ms = holding 50 fps. */
  budgetMs?: number;
  /** Length of one measuring window, ms. */
  windowMs?: number;
  /** Consecutive over-budget windows before a downgrade. */
  strikes?: number;
  /** Ignore everything for this long after start and after each change, ms. */
  warmupMs?: number;
  /** Frames longer than this are hitches or tab switches, not load; they are skipped. */
  hitchMs?: number;
}

/**
 * Watches frame times and says when to drop a rung: the median frame time of
 * `strikes` consecutive windows over budget. Pure, so it is tested headless.
 */
export class FrameBudget {
  private readonly budgetMs: number;
  private readonly windowMs: number;
  private readonly strikesNeeded: number;
  private readonly warmupMs: number;
  private readonly hitchMs: number;
  private samples: number[] = [];
  private windowStart: number | null = null;
  private quietUntil: number | null = null;
  private strikes = 0;

  constructor(options: FrameBudgetOptions = {}) {
    this.budgetMs = options.budgetMs ?? 20;
    this.windowMs = options.windowMs ?? 2_000;
    this.strikesNeeded = options.strikes ?? 2;
    this.warmupMs = options.warmupMs ?? 4_000;
    this.hitchMs = options.hitchMs ?? 250;
  }

  /** Start the warmup again (after a quality change, a scene swap, a tab return). */
  reset(nowMs: number): void {
    this.samples = [];
    this.windowStart = null;
    this.strikes = 0;
    this.quietUntil = nowMs + this.warmupMs;
  }

  /** Feed one frame. Returns true when the stage should drop a rung. */
  sample(frameMs: number, nowMs: number): boolean {
    if (this.quietUntil === null) this.quietUntil = nowMs + this.warmupMs;
    if (nowMs < this.quietUntil) return false;
    if (frameMs > this.hitchMs || frameMs <= 0) return false;
    if (this.windowStart === null) this.windowStart = nowMs;
    this.samples.push(frameMs);
    if (nowMs - this.windowStart < this.windowMs) return false;

    const median = medianOf(this.samples);
    this.samples = [];
    this.windowStart = nowMs;
    this.strikes = median > this.budgetMs ? this.strikes + 1 : 0;
    if (this.strikes < this.strikesNeeded) return false;
    this.reset(nowMs);
    return true;
  }
}

function medianOf(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

type Listener = () => void;

/** The live quality state: the current rung, pinned or auto, with change notifications. */
export class QualityController {
  private autoValue: boolean;
  private levelValue: number;
  private readonly budget: FrameBudget;
  private readonly listeners = new Set<Listener>();

  constructor(options: { tier?: QualityTier | null; budget?: FrameBudgetOptions } = {}) {
    this.autoValue = !options.tier;
    this.levelValue = options.tier ? TIER_LEVEL[options.tier] : 0;
    this.budget = new FrameBudget(options.budget);
  }

  get level(): number {
    return this.levelValue;
  }

  get auto(): boolean {
    return this.autoValue;
  }

  get settings(): QualitySettings {
    return settingsForLevel(this.levelValue);
  }

  get tier(): QualityTier {
    return this.settings.tier;
  }

  /** Pin a tier or rung; null resumes automatic adaptation from the current rung. */
  set(target: QualityTier | number | null, nowMs = 0): void {
    const auto = target === null;
    const level = auto ? this.levelValue : typeof target === "number" ? target : TIER_LEVEL[target];
    const clamped = settingsForLevel(level).level;
    if (clamped === this.levelValue && auto === this.autoValue) return;
    this.autoValue = auto;
    this.levelValue = clamped;
    this.budget.reset(nowMs);
    this.emit();
  }

  /** Feed a frame time; in auto mode this may drop a rung. Returns true if it did. */
  sampleFrame(frameMs: number, nowMs: number): boolean {
    if (!this.auto || this.levelValue >= QUALITY_LADDER.length - 1) return false;
    if (!this.budget.sample(frameMs, nowMs)) return false;
    this.levelValue += 1;
    this.emit();
    return true;
  }

  /** Restart the warmup (tab became visible again, heavy scene swap). */
  rest(nowMs: number): void {
    this.budget.reset(nowMs);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): QualitySettings => this.settings;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
