// SlopFight's sounds: typed cue names over the offline-rendered set in
// public/sfx/slopfight (scripts/slopfight/sfx). Pure audio, no three.js: the
// stage and the phone both use `sfx`. The files are a lazy sound bank, so
// they load only in SlopFight rooms.

import {
  createSoundBank,
  duck,
  type LoopHandle,
  type SoundAsset,
  type BusName,
} from "@/lib/sounds";
import { getArena, type ArenaId, type FinaleId, type RingOutLanding } from "./arenas";

/** The synth's sample rate and loop padding (render.mjs LOOP_PRE). */
const SAMPLE_RATE = 44_100;
const LOOP_PRE = 4_096;

/** A loop of `samples` length, stored with LOOP_PRE samples of padding in front. */
const loopOf = (samples: number) => ({
  start: LOOP_PRE / SAMPLE_RATE,
  end: (LOOP_PRE + samples) / SAMPLE_RATE,
});

const file = (name: string, extra: Omit<SoundAsset, "src"> = {}): SoundAsset => ({
  src: `/sfx/slopfight/${name}.mp3`,
  ...extra,
});

/** Every file in the set. Loop lengths are in samples and must match the manifest. */
export const SLOPFIGHT_FILES = {
  "ui-tap": file("ui-tap", { cooldownMs: 30 }),
  "ui-confirm": file("ui-confirm"),
  "ui-tick": file("ui-tick"),
  "ui-bet": file("ui-bet"),
  "ui-hype": file("ui-hype", { gain: 0.8 }),
  "foundry-pop-1": file("foundry-pop-1"),
  "foundry-pop-2": file("foundry-pop-2"),
  "foundry-pop-3": file("foundry-pop-3"),
  "foundry-inflate": file("foundry-inflate", { cooldownMs: 120 }),
  "foundry-ding": file("foundry-ding"),
  "foundry-shimmer": file("foundry-shimmer"),
  "loop-foundry-conveyor": file("loop-foundry-conveyor", { loop: loopOf(176_400) }),
  // Strikes are rendered with extra headroom so their crack never clips in the
  // MP3 decode; the trim makes the level back up in the (float) graph.
  "fight-strike-1": file("fight-strike-1", { gain: 1.3 }),
  "fight-strike-2": file("fight-strike-2", { gain: 1.25 }),
  "fight-strike-3": file("fight-strike-3", { gain: 1.13 }),
  "fight-grapple-lift": file("fight-grapple-lift"),
  "fight-grapple-slam": file("fight-grapple-slam"),
  "fight-trick-whiff": file("fight-trick-whiff"),
  "fight-trick-bonk": file("fight-trick-bonk"),
  "fight-slowmo": file("fight-slowmo", { cooldownMs: 400 }),
  "fight-thud-1": file("fight-thud-1"),
  "fight-thud-2": file("fight-thud-2"),
  "fight-boing": file("fight-boing"),
  "fight-crunch": file("fight-crunch", { cooldownMs: 60 }),
  "fight-edge-alarm": file("fight-edge-alarm", { cooldownMs: 1_200 }),
  "fight-ringout-scream": file("fight-ringout-scream"),
  "fight-finale": file("fight-finale"),
  "finale-tilt": file("finale-tilt"),
  "finale-flood": file("finale-flood"),
  "finale-storm": file("finale-storm"),
  "land-splash": file("land-splash"),
  "land-clang": file("land-clang"),
  "land-thud": file("land-thud"),
  "fight-ko": file("fight-ko"),
  "fight-win": file("fight-win"),
  "fight-lose": file("fight-lose"),
  "crowd-cheer": file("crowd-cheer"),
  "crowd-gasp": file("crowd-gasp", { cooldownMs: 600 }),
  "loop-crowd-murmur": file("loop-crowd-murmur", { loop: loopOf(352_800) }),
  "trans-slam": file("trans-slam"),
  "trans-wipe": file("trans-wipe"),
  "trans-letterbox": file("trans-letterbox"),
  "loop-amb-garage": file("loop-amb-garage", { loop: loopOf(352_800) }),
  "loop-amb-kitchen": file("loop-amb-kitchen", { loop: loopOf(352_800) }),
  "loop-amb-rooftop": file("loop-amb-rooftop", { loop: loopOf(352_800) }),
  "loop-music-build": file("loop-music-build", { loop: loopOf(392_000) }),
  "loop-music-foundry": file("loop-music-foundry", { loop: loopOf(423_360) }),
  "loop-music-fight": file("loop-music-fight", { loop: loopOf(529_200) }),
  "loop-music-result": file("loop-music-result", { loop: loopOf(423_360) }),
} as const satisfies Record<string, SoundAsset>;

export type SlopfightFile = keyof typeof SLOPFIGHT_FILES;

/** The lazy bank: nothing loads until a SlopFight screen plays or preloads. */
export const slopfightBank = createSoundBank("slopfight", SLOPFIGHT_FILES);

interface Cue {
  /** Variants, rotated so a repeat never plays the same file twice in a row. */
  files: readonly SlopfightFile[];
  /** Pitch spread in semitones across repeats. */
  jitter: number;
  /** Played instead of the rotation for big moments (intensity ≥ 0.75). */
  heavy?: SlopfightFile;
  /** How far intensity bends the pitch down at 1 (semitones). */
  weight?: number;
}

/** One-shot cues by what happens on screen. */
export const SFX_CUES = {
  // UI
  tap: { files: ["ui-tap"], jitter: 0.8 },
  confirm: { files: ["ui-confirm"], jitter: 0 },
  countdownTick: { files: ["ui-tick"], jitter: 0.2 },
  betPlaced: { files: ["ui-bet"], jitter: 0.5 },
  hype: { files: ["ui-hype"], jitter: 1 },
  // Foundry
  partPop: { files: ["foundry-pop-1", "foundry-pop-2", "foundry-pop-3"], jitter: 2 },
  inflate: { files: ["foundry-inflate"], jitter: 1.5 },
  nameCardDing: { files: ["foundry-ding"], jitter: 0 },
  sketchDissolve: { files: ["foundry-shimmer"], jitter: 0.5 },
  // Fight
  strikeThwack: {
    files: ["fight-strike-1", "fight-strike-2", "fight-strike-3"],
    jitter: 1.5,
    heavy: "fight-strike-3",
    weight: 2,
  },
  grappleLift: { files: ["fight-grapple-lift"], jitter: 1 },
  grappleSlam: { files: ["fight-grapple-slam"], jitter: 1, weight: 2 },
  trickWhiff: { files: ["fight-trick-whiff"], jitter: 2 },
  trickBonk: { files: ["fight-trick-bonk"], jitter: 1.5, weight: 1 },
  slowMo: { files: ["fight-slowmo"], jitter: 0.5 },
  ragdollThud: { files: ["fight-thud-1", "fight-thud-2"], jitter: 1.5, weight: 2 },
  boing: { files: ["fight-boing"], jitter: 2 },
  healthCrunch: { files: ["fight-crunch"], jitter: 1.2, weight: 1.5 },
  edgeAlarm: { files: ["fight-edge-alarm"], jitter: 0 },
  ringOutScream: { files: ["fight-ringout-scream"], jitter: 1 },
  // The finale: a shared sting, then the arena's own layer (sfx.finale picks it).
  finale: { files: ["fight-finale"], jitter: 0 },
  finaleTilt: { files: ["finale-tilt"], jitter: 0 },
  finaleFlood: { files: ["finale-flood"], jitter: 0 },
  finaleStorm: { files: ["finale-storm"], jitter: 0 },
  landingSplash: { files: ["land-splash"], jitter: 0.8 },
  landingClang: { files: ["land-clang"], jitter: 0.8 },
  landingThud: { files: ["land-thud"], jitter: 0.8 },
  koSting: { files: ["fight-ko"], jitter: 0 },
  winFanfare: { files: ["fight-win"], jitter: 0 },
  lossTrombone: { files: ["fight-lose"], jitter: 0 },
  crowdCheer: { files: ["crowd-cheer"], jitter: 0.8 },
  crowdGasp: { files: ["crowd-gasp"], jitter: 0.8 },
  // Transitions
  slam: { files: ["trans-slam"], jitter: 0.3 },
  wipe: { files: ["trans-wipe"], jitter: 0.5 },
  letterbox: { files: ["trans-letterbox"], jitter: 0.3 },
} as const satisfies Record<string, Cue>;

export type SfxName = keyof typeof SFX_CUES;

/** Looping beds and the bus each plays on. */
export const SFX_LOOPS = {
  musicBuild: { file: "loop-music-build", bus: "music" },
  musicFoundry: { file: "loop-music-foundry", bus: "music" },
  musicFight: { file: "loop-music-fight", bus: "music" },
  musicResult: { file: "loop-music-result", bus: "music" },
  ambGarage: { file: "loop-amb-garage", bus: "ambience" },
  ambKitchen: { file: "loop-amb-kitchen", bus: "ambience" },
  ambRooftop: { file: "loop-amb-rooftop", bus: "ambience" },
  crowdMurmur: { file: "loop-crowd-murmur", bus: "ambience" },
  conveyor: { file: "loop-foundry-conveyor", bus: "ambience" },
} as const satisfies Record<string, { file: SlopfightFile; bus: BusName }>;

export type LoopName = keyof typeof SFX_LOOPS;

/** One music loop per phase family. */
export type MusicFamily = "build" | "foundry" | "fight" | "result";
const MUSIC: Record<MusicFamily, LoopName> = {
  build: "musicBuild",
  foundry: "musicFoundry",
  fight: "musicFight",
  result: "musicResult",
};

const AMBIENCE: Record<ArenaId, LoopName> = {
  FLOODED_GARAGE: "ambGarage",
  KITCHEN_COUNTER: "ambKitchen",
  ROOFTOP: "ambRooftop",
};

const FINALE_LAYER: Record<FinaleId, SfxName> = {
  tilt: "finaleTilt",
  flood: "finaleFlood",
  storm: "finaleStorm",
};

const LANDING: Record<RingOutLanding, SfxName> = {
  splash: "landingSplash",
  clang: "landingClang",
  thud: "landingThud",
};

export interface SfxOptions {
  /** 0..1, how big the moment is: louder, a touch lower, heavier variants. */
  intensity?: number;
  /** Seconds from now, to land the sound on a frame scheduled ahead. */
  at?: number;
  /** Stereo position, -1 (left) to 1 (right), e.g. the fighter's screen x. */
  pan?: number;
  /** Extra linear gain. */
  gain?: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (tested)
// ---------------------------------------------------------------------------

const GOLDEN = 0.618_033_988_75;

/**
 * The pitch offset for the `count`-th repeat of a cue: a golden-ratio
 * sequence in [-jitter, jitter], so consecutive repeats always land far
 * apart and no two plays in a burst sound identical.
 */
export function repeatOffset(count: number, jitter: number): number {
  if (jitter <= 0) return 0;
  return jitter * (((count * GOLDEN) % 1) * 2 - 1);
}

/** The file for the `count`-th play: the heavy variant for big moments, else a rotation. */
export function pickVariant(cue: Cue, count: number, intensity = 0.5): SlopfightFile {
  if (cue.heavy && intensity >= 0.75) return cue.heavy;
  const files =
    cue.heavy && cue.files.length > 1 ? cue.files.filter((f) => f !== cue.heavy) : cue.files;
  return files[count % files.length]!;
}

/** Gain and pitch for an intensity: quiet small taps, big low hits. */
export function intensityShape(intensity: number, weight = 0): { gain: number; semitones: number } {
  const level = Math.max(0, Math.min(1, intensity));
  return { gain: 0.55 + 0.45 * level, semitones: -weight * (level - 0.5) };
}

/** Taps closer together than this build the hype stack. */
export const HYPE_STACK_WINDOW_MS = 700;
export const HYPE_STACK_MAX = 8;

/** The next hype stack height: rapid taps climb, a pause resets. */
export function nextHypeStack(previous: number, lastAtMs: number, nowMs: number): number {
  return nowMs - lastAtMs <= HYPE_STACK_WINDOW_MS ? Math.min(HYPE_STACK_MAX, previous + 1) : 0;
}

// ---------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------

const counts = new Map<SfxName, number>();
const loops = new Map<LoopName, LoopHandle>();
let currentMusic: LoopName | null = null;
let currentAmbience: LoopName | null = null;
let hypeStack = 0;
let hypeAt = -Infinity;

function play(name: SfxName, options: SfxOptions = {}): void {
  const cue: Cue = SFX_CUES[name];
  const count = counts.get(name) ?? 0;
  counts.set(name, count + 1);
  const intensity = options.intensity ?? 0.5;
  const shape = intensityShape(intensity, cue.weight);
  let semitones = shape.semitones + repeatOffset(count, cue.jitter);
  let gain = shape.gain * (options.gain ?? 1);
  if (name === "hype") {
    // Rapid taps stack: each whoop overlaps the last, a little higher and louder.
    const now = typeof performance === "undefined" ? Date.now() : performance.now();
    hypeStack = nextHypeStack(hypeStack, hypeAt, now);
    hypeAt = now;
    semitones += hypeStack * 0.45;
    gain *= 0.8 + hypeStack * 0.05;
  }
  slopfightBank.play(pickVariant(cue, count, intensity), {
    semitones,
    gain,
    pan: options.pan,
    delay: options.at,
  });
}

function loop(name: LoopName, options: { gain?: number; fadeIn?: number } = {}): LoopHandle {
  const existing = loops.get(name);
  if (existing && !existing.stopped) return existing;
  const { file: source, bus } = SFX_LOOPS[name];
  const handle = slopfightBank.loop(source, { bus, gain: options.gain, fadeIn: options.fadeIn });
  loops.set(name, handle);
  return handle;
}

function stopLoop(name: LoopName, seconds = 0.6): void {
  loops.get(name)?.stop(seconds);
  loops.delete(name);
  if (currentMusic === name) currentMusic = null;
  if (currentAmbience === name) currentAmbience = null;
}

/**
 * SlopFight's sound API for the stage and the phone. Cues pick a variant and
 * a fresh pitch each time; loops are one per name (asking again returns the
 * running one).
 */
export const sfx = {
  play,
  loop,
  stopLoop,
  /** Switches the music bed to a phase family's loop (null for silence), crossfading. */
  music(family: MusicFamily | null, crossfade = 1.2): void {
    const next = family ? MUSIC[family] : null;
    if (next === currentMusic) return;
    if (currentMusic) stopLoop(currentMusic, crossfade);
    if (next) loop(next, { fadeIn: crossfade });
    currentMusic = next;
  },
  /** Switches the ambience bed to an arena's loop (null for none). */
  ambience(arena: ArenaId | null, crossfade = 1.5): void {
    const next = arena ? AMBIENCE[arena] : null;
    if (next === currentAmbience) return;
    if (currentAmbience) stopLoop(currentAmbience, crossfade);
    if (next) loop(next, { fadeIn: crossfade });
    currentAmbience = next;
  },
  /** The arena's ring-out landing: splash, clang or thud. */
  landing(arena: ArenaId, options?: SfxOptions): void {
    play(LANDING[getArena(arena).ringOutLanding], options);
  },
  /** The arena's finale starting: the shared sting and the arena's layer (the counter's creak, the surge, the thunder). */
  finale(arena: ArenaId, options?: SfxOptions): void {
    play("finale", options);
    play(FINALE_LAYER[getArena(arena).finale.id], options);
  },
  /** Hit stop: the beds drop out for `ms` so the impact lands in a gap. */
  hitStop(ms = 70): void {
    duck(0.08, ms);
  },
  /** Dips music and ambience under a big moment (depth is a gain, 0..1). */
  duck,
  /** Stops every loop. */
  stopAll(seconds = 0.4): void {
    // Deleting the current key while iterating a Map is safe.
    for (const name of loops.keys()) stopLoop(name, seconds);
  },
  /** Starts fetching every file (decoding waits for audio to unlock). */
  preload(): void {
    slopfightBank.preload();
  },
};
