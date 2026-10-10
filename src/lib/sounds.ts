import { mixedHash } from "./hash";
import { AudioLoop, rampParam } from "./audio-loop";

const SOUND_MAP = {
  // Shared game sounds
  "game-start": "/sfx/shared/game-start.mp3",
  "phase-transition": "/sfx/shared/phase-transition.mp3",
  submitted: "/sfx/shared/submitted.mp3",
  "vote-cast": "/sfx/shared/vote-cast.mp3",
  "winner-reveal": "/sfx/shared/winner-reveal.mp3",
  celebration: "/sfx/shared/celebration.mp3",
  "round-transition": "/sfx/shared/round-transition.mp3",
  "game-over": "/sfx/shared/game-over.mp3",
  "player-join": "/sfx/shared/player-join.mp3",
  "player-leave": "/sfx/shared/player-leave.mp3",
  // Sloplash-specific sounds
  "stamp-slam": "/sfx/sloplash/stamp-slam.mp3",
  "vote-reveal": "/sfx/sloplash/vote-reveal.mp3",
  "timer-warning": "/sfx/sloplash/timer-warning.mp3",
  "prompt-advance": "/sfx/sloplash/prompt-advance.mp3",
  // MatchSlop conversation sounds
  "chat-send": "/sfx/matchslop/chat-send.mp3",
  "chat-receive": "/sfx/matchslop/chat-receive.mp3",
  "all-in": "/sfx/matchslop/all-in.mp3",
  "round-start": "/sfx/matchslop/round-start.mp3",
} as const;

export type SoundName = keyof typeof SOUND_MAP;
export const SOUND_NAMES = Object.keys(SOUND_MAP) as SoundName[];

export type AudioStatus = "idle" | "ready" | "blocked" | "error" | "unsupported";

/** Where a sound plays: the compressed SFX bus, or one of the two beds under it. */
export type BusName = "sfx" | "music" | "ambience";
/** The beds: their own gains, ducked under the narrator and under big moments. */
export type BedBus = Exclude<BusName, "sfx">;

/** Per-call playback options. Everything is optional; no options plays the sound as authored. */
export interface PlayOptions {
  /** Linear gain on top of the sound's own trim. */
  gain?: number;
  /** Stereo position from -1 (left) to 1 (right). */
  pan?: number;
  /** Pitch shift in semitones (playback rate, so it changes length too). */
  semitones?: number;
  /** Random pitch spread of up to ± this many semitones. */
  jitter?: number;
  /** Makes the jitter repeatable: the same seed always picks the same pitch. */
  seed?: number | string;
  /** Seconds from now to start, scheduled on the audio clock. */
  delay?: number;
  /** Defaults to "sfx". */
  bus?: BusName;
}

export interface LoopOptions {
  /** Linear gain on top of the sound's own trim. */
  gain?: number;
  /** Fade-in in seconds. */
  fadeIn?: number;
  /** Pitch shift in semitones. */
  semitones?: number;
  /** Defaults to "sfx". */
  bus?: BusName;
}

/** A running loop. Stopping is final; start a new loop to play it again. */
export interface LoopHandle {
  /** Ramps the loop's gain (relative to its starting gain of 1) over `seconds`. */
  fade(gain: number, seconds?: number): void;
  /** Fades out over `seconds` and stops. */
  stop(seconds?: number): void;
  readonly stopped: boolean;
}

/** One file in a game's sound bank. */
export interface SoundAsset {
  src: string;
  /** Linear trim. Defaults to 1. */
  gain?: number;
  /** Repeats closer together than this many milliseconds are dropped. */
  cooldownMs?: number;
  /** Loop window in seconds. Looping files carry padding around the loop. */
  loop?: { start: number; end: number };
}

/**
 * A game's own sounds, registered at the game's import site so its files are
 * fetched only in that game's rooms (never by `preloadSounds`).
 */
export interface SoundBank<N extends string> {
  readonly id: string;
  readonly names: readonly N[];
  /** Fetches every file now and decodes once audio exists. */
  preload(): void;
  /** Fetches and decodes one file; rejects when it cannot. */
  load(name: N): Promise<AudioBuffer>;
  play(name: N, options?: PlayOptions): void;
  playAndWait(name: N, options?: PlayOptions): Promise<boolean>;
  loop(name: N, options?: LoopOptions): LoopHandle;
}

interface AudioPreferencesV1 {
  version: 1;
  muted: boolean;
  volume: number;
}

const AUDIO_PREFERENCES_STORAGE_KEY = "audioPreferences:v1";
const DEFAULT_VOLUME = 0.5;

/** Fade-in duration in seconds to soften aggressive starts. */
const DEFAULT_FADE_IN_S = 0.02;
/** Fade-out duration in seconds to reduce abrupt tails. */
const DEFAULT_FADE_OUT_S = 0.02;
/** Bank files are authored with their own envelopes; these only guard against edge clicks. */
const BANK_FADE_IN_S = 0.001;
const BANK_FADE_OUT_S = 0.005;

// --- Web Audio API state ---
let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let sfxBusGain: GainNode | null = null;
let narratorBusGain: GainNode | null = null;
const busGains: Record<BedBus, GainNode | null> = { music: null, ambience: null };
/** The beds pass through two duck stages in series: the narrator's and big moments'. */
let bedNarratorDuck: GainNode | null = null;
let bedMomentDuck: GainNode | null = null;
const bufferCache = new Map<string, AudioBuffer>();
const inflightBufferLoads = new Map<string, Promise<AudioBuffer>>();
const prefetchedBytes = new Map<string, Promise<ArrayBuffer>>();
const lastPlayAtMs = new Map<string, number>();
let resumePromise: Promise<void> | null = null;
let audioStatus: AudioStatus = "idle";
let audioIssue: string | null = null;

// --- Narrator ducking ---
let narratorDucking = false;
const DUCK_GAIN = 0.35;
const DUCK_ATTACK_S = 0.03;
const DUCK_RELEASE_S = 0.25;
/** Music and ambience sit further under the narrator than SFX do. */
const BED_NARRATOR_DUCK_GAIN = 0.3;

// --- Moment ducking (duck(depth, ms)) ---
const MOMENT_DUCK_ATTACK_S = 0.04;
const MOMENT_DUCK_RELEASE_S = 0.35;
let momentDuck: { depth: number; until: number } | null = null;

const DEFAULT_BUS_GAIN: Record<BedBus, number> = { music: 0.55, ambience: 0.8 };
const busGainValues: Record<BedBus, number> = { ...DEFAULT_BUS_GAIN };

const SOUND_COOLDOWN_MS: Partial<Record<SoundName, number>> = {
  "vote-cast": 60,
  "prompt-advance": 120,
  "player-join": 200,
  "player-leave": 200,
  submitted: 80,
  "chat-send": 100,
  "chat-receive": 150,
};

// Per-sound trim multipliers (linear gain) to normalize AI-generated SFX.
// 1.0 = unchanged, <1.0 quieter, >1.0 louder.
const DEFAULT_SOUND_GAIN_MULTIPLIER: Partial<Record<SoundName, number>> = {
  celebration: 0.75,
  "game-over": 0.8,
  "winner-reveal": 0.85,
  "phase-transition": 0.9,
  "round-transition": 0.9,
  "stamp-slam": 0.8,
  "vote-reveal": 0.9,
  "player-join": 0.85,
  "player-leave": 0.85,
  "chat-send": 0.6,
  "chat-receive": 0.5,
  "all-in": 0.85,
  "round-start": 0.85,
};

type SoundTuningStorage = {
  fadeInS?: number;
  fadeOutS?: number;
  gains?: Partial<Record<SoundName, number>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const SOUND_TUNING_STORAGE_KEY = "soundsTuningV1";
let fadeInS = DEFAULT_FADE_IN_S;
let fadeOutS = DEFAULT_FADE_OUT_S;
let soundGainMultiplier: Partial<Record<SoundName, number>> = { ...DEFAULT_SOUND_GAIN_MULTIPLIER };

/** Returns the shared AudioContext + master GainNode (creates lazily). */
export function getAudioContext(): { ctx: AudioContext; gain: GainNode } {
  if (!audioContext) {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") {
      setAudioIssue("This browser does not support Web Audio.");
      setAudioStatus("unsupported");
      throw new Error("Web Audio is not supported");
    }

    try {
      audioContext = new AudioContext();
    } catch (cause) {
      const message = getErrorMessage(cause, "Could not create the audio engine.");
      setAudioIssue(message);
      setAudioStatus("error");
      throw cause;
    }

    // Compressor for volume normalization across all sounds
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 12;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    masterGain = audioContext.createGain();
    masterGain.gain.value = muted ? 0 : volume;

    // Submix buses under masterGain. A duck requested before the context
    // existed takes effect now instead of being lost.
    sfxBusGain = audioContext.createGain();
    sfxBusGain.gain.value = narratorDucking ? DUCK_GAIN : 1;
    narratorBusGain = audioContext.createGain();
    narratorBusGain.gain.value = 1;

    // SFX bus → compressor → master → destination
    sfxBusGain.connect(compressor);
    compressor.connect(masterGain);
    // Narrator bus → master → destination (bypasses compressor)
    narratorBusGain.connect(masterGain);

    // Beds: music and ambience → narrator duck → moment duck → master. They
    // bypass the SFX compressor so hits never pump the music.
    bedNarratorDuck = audioContext.createGain();
    bedNarratorDuck.gain.value = narratorDucking ? BED_NARRATOR_DUCK_GAIN : 1;
    bedMomentDuck = audioContext.createGain();
    bedMomentDuck.gain.value = 1;
    bedNarratorDuck.connect(bedMomentDuck);
    bedMomentDuck.connect(masterGain);
    for (const bus of ["music", "ambience"] as const) {
      const node = audioContext.createGain();
      node.gain.value = busGainValues[bus];
      node.connect(bedNarratorDuck);
      busGains[bus] = node;
    }

    masterGain.connect(audioContext.destination);
    audioContext.addEventListener("statechange", syncAudioContextStatus);
    syncAudioContextStatus();
    // Banks preloaded before audio existed decode now.
    for (const src of prefetchedBytes.keys()) {
      void loadBuffer(src, src).catch(() => {
        // Surfaced when the sound is actually played.
      });
    }
  }
  if (!masterGain) throw new Error("Audio master gain was not initialized");
  return { ctx: audioContext, gain: masterGain };
}

// --- Volume & mute state ---
function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function readAudioPreferences(): AudioPreferencesV1 {
  if (typeof window === "undefined") {
    return { version: 1, muted: false, volume: DEFAULT_VOLUME };
  }

  try {
    const raw = localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        isRecord(parsed) &&
        parsed.version === 1 &&
        typeof parsed.muted === "boolean" &&
        typeof parsed.volume === "number" &&
        Number.isFinite(parsed.volume)
      ) {
        return { version: 1, muted: parsed.muted, volume: clampVolume(parsed.volume) };
      }
    }
  } catch {
    // Unavailable or corrupt storage falls back to the defaults below.
  }
  return { version: 1, muted: false, volume: DEFAULT_VOLUME };
}

const initialAudioPreferences = readAudioPreferences();
let volume = initialAudioPreferences.volume;
let muted = initialAudioPreferences.muted;

const audioListeners = new Set<() => void>();
let audioStateVersion = 0;

function notifyAudioListeners(): void {
  audioStateVersion += 1;
  audioListeners.forEach((listener) => listener());
}

function setAudioStatus(nextStatus: AudioStatus): void {
  if (audioStatus === nextStatus) return;
  audioStatus = nextStatus;
  notifyAudioListeners();
}

function setAudioIssue(message: string | null): void {
  if (audioIssue === message) return;
  audioIssue = message;
  notifyAudioListeners();
}

function getErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}

function syncAudioContextStatus(): void {
  if (!audioContext) {
    setAudioStatus("idle");
    return;
  }
  if (audioContext.state === "running") {
    setAudioStatus("ready");
  } else if (audioContext.state === "closed") {
    setAudioIssue("The audio engine closed unexpectedly. Reload to restore sound.");
    setAudioStatus("error");
  } else {
    setAudioStatus("blocked");
  }
}

function persistAudioPreferences(): void {
  if (typeof window === "undefined") return;
  try {
    const preferences: AudioPreferencesV1 = { version: 1, muted, volume };
    localStorage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Audio still works when storage is unavailable; preferences just will not persist.
  }
}

/** Sync the master gain node and notify subscribers. */
function syncGainAndNotify(): void {
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : volume;
  }
  notifyAudioListeners();
}

function persistSoundTuning(): void {
  if (typeof window === "undefined") return;
  const payload: SoundTuningStorage = {
    fadeInS,
    fadeOutS,
    gains: soundGainMultiplier,
  };
  try {
    localStorage.setItem(SOUND_TUNING_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Tuning remains active for this tab when storage is unavailable.
  }
}

function loadSoundTuningFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(SOUND_TUNING_STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return;
    if (typeof parsed.fadeInS === "number" && Number.isFinite(parsed.fadeInS)) {
      fadeInS = Math.max(0, Math.min(0.5, parsed.fadeInS));
    }
    if (typeof parsed.fadeOutS === "number" && Number.isFinite(parsed.fadeOutS)) {
      fadeOutS = Math.max(0, Math.min(0.5, parsed.fadeOutS));
    }
    if (isRecord(parsed.gains)) {
      for (const name of SOUND_NAMES) {
        const value = parsed.gains[name];
        if (typeof value === "number" && Number.isFinite(value)) {
          soundGainMultiplier[name] = Math.max(0, Math.min(3, value));
        }
      }
    }
  } catch {
    // Ignore malformed tuning storage
  }
}

if (typeof window !== "undefined") {
  loadSoundTuningFromStorage();
}

export function getVolume(): number {
  return volume;
}

export function setVolume(v: number): void {
  volume = clampVolume(v);
  // Dragging up from 0 while muted → auto-unmute
  if (volume > 0 && muted) {
    muted = false;
  }
  persistAudioPreferences();
  syncGainAndNotify();
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  // Unmuting while volume is 0 → restore to a sane default
  if (!muted && volume === 0) {
    volume = DEFAULT_VOLUME;
  }
  persistAudioPreferences();
  syncGainAndNotify();
  return muted;
}

export function subscribeAudio(cb: () => void): () => void {
  audioListeners.add(cb);
  return () => {
    audioListeners.delete(cb);
  };
}

export function getAudioStateVersion(): number {
  return audioStateVersion;
}

export function getAudioStatus(): AudioStatus {
  return audioStatus;
}

export function getAudioIssue(): string | null {
  return audioIssue;
}

export function getFadeInSeconds(): number {
  return fadeInS;
}

export function setFadeInSeconds(value: number): void {
  fadeInS = Math.max(0, Math.min(0.5, value));
  persistSoundTuning();
  syncGainAndNotify();
}

export function getFadeOutSeconds(): number {
  return fadeOutS;
}

export function setFadeOutSeconds(value: number): void {
  fadeOutS = Math.max(0, Math.min(0.5, value));
  persistSoundTuning();
  syncGainAndNotify();
}

export function getSoundGainMultiplier(name: SoundName): number {
  return soundGainMultiplier[name] ?? 1;
}

export function getDefaultSoundGainMultiplier(name: SoundName): number {
  return DEFAULT_SOUND_GAIN_MULTIPLIER[name] ?? 1;
}

export function setSoundGainMultiplier(name: SoundName, value: number): void {
  const next = Math.max(0, Math.min(3, value));
  soundGainMultiplier = { ...soundGainMultiplier, [name]: next };
  persistSoundTuning();
  syncGainAndNotify();
}

export function resetSoundTuning(): void {
  fadeInS = DEFAULT_FADE_IN_S;
  fadeOutS = DEFAULT_FADE_OUT_S;
  soundGainMultiplier = { ...DEFAULT_SOUND_GAIN_MULTIPLIER };
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(SOUND_TUNING_STORAGE_KEY);
    } catch {
      // The in-memory reset still succeeds when storage is unavailable.
    }
  }
  syncGainAndNotify();
}

// --- Bed buses and ducking ---

export function getBusGain(bus: BedBus): number {
  return busGainValues[bus];
}

/** Sets a bed's level (0..1.5), ramped over `seconds`. */
export function setBusGain(bus: BedBus, gain: number, seconds = 0.05): void {
  const next = Math.max(0, Math.min(1.5, gain));
  busGainValues[bus] = next;
  const node = busGains[bus];
  if (node && audioContext) rampParam(node.gain, next, audioContext.currentTime, seconds);
  notifyAudioListeners();
}

/**
 * Dips music and ambience to `depth` (a gain, 0..1) for `ms` milliseconds,
 * then lets them back up. Overlapping calls keep the deepest dip and the
 * latest end. SFX and the narrator are untouched.
 */
export function duck(depth: number, ms: number): void {
  if (!audioContext || !bedMomentDuck) return;
  const now = audioContext.currentTime;
  const target = Math.max(0, Math.min(1, depth));
  const active = momentDuck && momentDuck.until > now ? momentDuck : null;
  const next = {
    depth: active ? Math.min(active.depth, target) : target,
    until: Math.max(active?.until ?? 0, now + Math.max(0, ms) / 1000),
  };
  momentDuck = next;
  const param = bedMomentDuck.gain;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(next.depth, now + MOMENT_DUCK_ATTACK_S);
  param.setValueAtTime(next.depth, Math.max(now + MOMENT_DUCK_ATTACK_S, next.until));
  param.linearRampToValueAtTime(
    1,
    Math.max(now + MOMENT_DUCK_ATTACK_S, next.until) + MOMENT_DUCK_RELEASE_S,
  );
}

// --- Loading ---

let preloaded = false;

function activateAndPreloadSounds(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const ready = activateAudio();
  if (!preloaded) {
    preloaded = true;
    for (const name of SOUND_NAMES) {
      void loadSoundBuffer(name).catch((cause: unknown) => {
        setAudioIssue(getErrorMessage(cause, `Could not load the ${name} sound.`));
      });
    }
  }
  return ready;
}

export function preloadSounds(): void {
  void activateAndPreloadSounds();
}

function shouldThrottle(key: string, cooldownMs: number | undefined): boolean {
  if (!cooldownMs) return false;

  const now = performance.now();
  const last = lastPlayAtMs.get(key) ?? -Infinity;
  if (now - last < cooldownMs) return true;
  lastPlayAtMs.set(key, now);
  return false;
}

function isAudioContextRunning(ctx: AudioContext): boolean {
  return String(ctx.state) === "running";
}

async function ensureAudioContextRunning(ctx: AudioContext): Promise<boolean> {
  if (isAudioContextRunning(ctx)) {
    setAudioStatus("ready");
    return true;
  }
  if (resumePromise) {
    await resumePromise;
    syncAudioContextStatus();
    return isAudioContextRunning(ctx);
  }

  resumePromise = ctx
    .resume()
    .catch(() => {
      // Browsers commonly reject resume() until a direct user gesture occurs.
    })
    .finally(() => {
      resumePromise = null;
    });

  await resumePromise;
  syncAudioContextStatus();
  return isAudioContextRunning(ctx);
}

export async function activateAudio(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { ctx } = getAudioContext();
    return await ensureAudioContextRunning(ctx);
  } catch (cause) {
    setAudioIssue(getErrorMessage(cause, "Could not start audio."));
    if (audioStatus !== "unsupported") setAudioStatus("error");
    return false;
  }
}

function fetchBytes(src: string, label: string): Promise<ArrayBuffer> {
  return fetch(src).then((res) => {
    if (!res.ok) throw new Error(`Failed to load sound: ${label}`);
    return res.arrayBuffer();
  });
}

/** Fetches (or reuses prefetched bytes) and decodes one file, cached by URL. */
function loadBuffer(src: string, label: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(src);
  if (cached) return Promise.resolve(cached);

  const inflight = inflightBufferLoads.get(src);
  if (inflight) return inflight;

  let ctx: AudioContext;
  try {
    ({ ctx } = getAudioContext());
  } catch (cause) {
    return Promise.reject(cause);
  }
  // Creating the context starts decoding preloaded banks. That may have
  // already started this exact load while getAudioContext was initializing.
  const startedWithContext = inflightBufferLoads.get(src);
  if (startedWithContext) return startedWithContext;
  // decodeAudioData detaches its input, so prefetched bytes are used once.
  const bytes = prefetchedBytes.get(src) ?? fetchBytes(src, label);
  prefetchedBytes.delete(src);
  const request = bytes
    .then((buf) => ctx.decodeAudioData(buf))
    .then((audioBuffer) => {
      bufferCache.set(src, audioBuffer);
      return audioBuffer;
    })
    .finally(() => {
      inflightBufferLoads.delete(src);
    });

  inflightBufferLoads.set(src, request);
  return request;
}

function loadSoundBuffer(name: SoundName): Promise<AudioBuffer> {
  return loadBuffer(SOUND_MAP[name], name);
}

// --- Playback ---

/** The pitch ratio for `options`: semitones plus seeded or random jitter. */
export function playbackRateFor(
  options: Pick<PlayOptions, "semitones" | "jitter" | "seed">,
): number {
  const jitter = Math.max(0, options.jitter ?? 0);
  const spread =
    jitter === 0
      ? 0
      : options.seed === undefined
        ? Math.random() * 2 - 1
        : seededSpread(options.seed);
  const semitones = (options.semitones ?? 0) + jitter * spread;
  return 2 ** (semitones / 12);
}

/** A value in [-1, 1) from a seed, the same on every runtime. */
function seededSpread(seed: number | string): number {
  return (mixedHash(String(seed)) / 4294967296) * 2 - 1;
}

function busNode(bus: BusName | undefined): AudioNode | null {
  if (bus === "music" || bus === "ambience") return busGains[bus];
  return sfxBusGain ?? compressor ?? masterGain;
}

/** Inserts a stereo panner when the browser has one and the sound is off centre. */
function panned(ctx: AudioContext, input: AudioNode, pan: number | undefined): AudioNode[] {
  if (!pan || typeof ctx.createStereoPanner !== "function") return [input];
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  input.connect(panner);
  return [input, panner];
}

interface OneShot {
  key: string;
  src: string;
  label: string;
  trim: number;
  cooldownMs: number | undefined;
  fadeIn: number;
  fadeOut: number;
}

function startOneShot(ctx: AudioContext, buffer: AudioBuffer, shot: OneShot, options: PlayOptions) {
  const target = busNode(options.bus);
  if (!target) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const rate = playbackRateFor(options);
  if (rate !== 1 && source.playbackRate) source.playbackRate.value = rate;
  const soundGain = Math.max(0, shot.trim * (options.gain ?? 1));

  // Per-sound fade-in gain to soften aggressive starts
  const fadeGain = ctx.createGain();
  const startAt = ctx.currentTime + Math.max(0, options.delay ?? 0);
  const duration = buffer.duration / rate;
  const safeDuration = Math.max(0, duration - 0.001);
  const effectiveFadeIn = Math.min(Math.max(0, shot.fadeIn), safeDuration);
  const effectiveFadeOut = Math.min(
    Math.max(0, shot.fadeOut),
    Math.max(0, safeDuration - effectiveFadeIn),
  );
  const endAt = startAt + duration;

  fadeGain.gain.setValueAtTime(effectiveFadeIn > 0 ? 0 : soundGain, startAt);
  if (effectiveFadeIn > 0) {
    fadeGain.gain.linearRampToValueAtTime(soundGain, startAt + effectiveFadeIn);
  }
  if (effectiveFadeOut > 0) {
    const fadeOutStartAt = Math.max(startAt, endAt - effectiveFadeOut);
    fadeGain.gain.setValueAtTime(soundGain, fadeOutStartAt);
    fadeGain.gain.linearRampToValueAtTime(0, endAt);
  }

  // Chain: source → fadeGain → [panner] → bus → … → masterGain → destination
  source.connect(fadeGain);
  const chain = panned(ctx, fadeGain, options.pan);
  chain[chain.length - 1]!.connect(target);
  source.onended = () => {
    source.disconnect();
    for (const node of chain) node.disconnect();
  };
  if (startAt > ctx.currentTime) source.start(startAt);
  else source.start();
}

async function playOneShot(shot: OneShot, options: PlayOptions = {}): Promise<boolean> {
  if (typeof window === "undefined" || muted) return false;
  if (shouldThrottle(shot.key, shot.cooldownMs)) return false;

  let ctx: AudioContext;
  try {
    ({ ctx } = getAudioContext());
  } catch (cause) {
    setAudioIssue(getErrorMessage(cause, "Could not start audio."));
    return false;
  }
  // Start resume() synchronously. When playSound() was called from a click,
  // deferring this until after fetch/decode would lose the browser user gesture.
  const readyPromise = ensureAudioContextRunning(ctx);

  try {
    const [ready, audioBuffer] = await Promise.all([
      readyPromise,
      loadBuffer(shot.src, shot.label),
    ]);
    if (!muted && ready && isAudioContextRunning(ctx)) {
      startOneShot(ctx, audioBuffer, shot, options);
      setAudioIssue(null);
      return true;
    }
    return false;
  } catch (cause) {
    setAudioIssue(getErrorMessage(cause, `Could not play the ${shot.label} sound.`));
    return false;
  }
}

function sharedShot(name: SoundName): OneShot {
  return {
    key: name,
    src: SOUND_MAP[name],
    label: name,
    trim: soundGainMultiplier[name] ?? 1,
    cooldownMs: SOUND_COOLDOWN_MS[name],
    fadeIn: fadeInS,
    fadeOut: fadeOutS,
  };
}

export async function playSoundAndWait(name: SoundName, options?: PlayOptions): Promise<boolean> {
  return playOneShot(sharedShot(name), options);
}

/** Fire-and-forget playback for UI event handlers and effects. */
export function playSound(name: SoundName, options?: PlayOptions): void {
  void playSoundAndWait(name, options);
}

/**
 * Registers a game's sounds without loading any of them: files are fetched on
 * first use or by `preload()`, so other games' rooms never pay for them.
 */
export function createSoundBank<N extends string>(
  id: string,
  assets: Readonly<Record<N, SoundAsset>>,
): SoundBank<N> {
  const names = Object.keys(assets) as N[];
  const shot = (name: N): OneShot => {
    const asset = assets[name];
    return {
      key: `${id}:${name}`,
      src: asset.src,
      label: name,
      trim: asset.gain ?? 1,
      cooldownMs: asset.cooldownMs,
      fadeIn: BANK_FADE_IN_S,
      fadeOut: BANK_FADE_OUT_S,
    };
  };

  return {
    id,
    names,
    preload() {
      if (typeof window === "undefined") return;
      for (const name of names) {
        const { src } = assets[name];
        if (bufferCache.has(src) || inflightBufferLoads.has(src)) continue;
        if (audioContext) {
          void loadBuffer(src, name).catch(() => {
            // Surfaced when the sound is played.
          });
        } else if (!prefetchedBytes.has(src)) {
          const bytes = fetchBytes(src, name);
          bytes.catch(() => {
            prefetchedBytes.delete(src);
          });
          prefetchedBytes.set(src, bytes);
        }
      }
    },
    load(name) {
      return loadBuffer(assets[name].src, name);
    },
    play(name, options) {
      void playOneShot(shot(name), options);
    },
    playAndWait(name, options) {
      return playOneShot(shot(name), options);
    },
    loop(name, options = {}) {
      const asset = assets[name];
      const handle = new AudioLoop(Math.max(0, (asset.gain ?? 1) * (options.gain ?? 1)));
      if (typeof window === "undefined") {
        handle.stopped = true;
        return handle;
      }
      let ctx: AudioContext;
      try {
        ({ ctx } = getAudioContext());
      } catch (cause) {
        setAudioIssue(getErrorMessage(cause, "Could not start audio."));
        handle.stopped = true;
        return handle;
      }
      // Loops start even while audio is blocked or muted: they become audible
      // when the context resumes or the room unmutes.
      void ensureAudioContextRunning(ctx);
      loadBuffer(asset.src, name)
        .then((buffer) => handle.attach(ctx, buffer, asset, options, busNode(options.bus)))
        .catch((cause: unknown) => {
          setAudioIssue(getErrorMessage(cause, `Could not play the ${name} sound.`));
        });
      return handle;
    },
  };
}

let audioUnlockConsumerCount = 0;
let audioUnlockListenersInstalled = false;

function removeAudioUnlockListeners(): void {
  if (!audioUnlockListenersInstalled || typeof window === "undefined") return;
  window.removeEventListener("pointerdown", handleAudioUnlock);
  window.removeEventListener("keydown", handleAudioUnlock);
  audioUnlockListenersInstalled = false;
}

function handleAudioUnlock(): void {
  removeAudioUnlockListeners();
  void activateAndPreloadSounds().then((ready) => {
    // A gesture can still be rejected while a tab is backgrounded. Keep the
    // one-shot unlock path armed so the next interaction gets another chance.
    if (!ready && audioUnlockConsumerCount > 0) installAudioUnlockListeners();
  });
}

function installAudioUnlockListeners(): void {
  if (
    audioUnlockListenersInstalled ||
    typeof window === "undefined" ||
    audioStatus === "ready" ||
    audioStatus === "unsupported"
  ) {
    return;
  }
  window.addEventListener("pointerdown", handleAudioUnlock);
  window.addEventListener("keydown", handleAudioUnlock);
  audioUnlockListenersInstalled = true;
}

/** Shares one first-interaction unlock listener across every mounted audio control. */
export function listenForAudioUnlock(): () => void {
  audioUnlockConsumerCount += 1;
  installAudioUnlockListeners();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    audioUnlockConsumerCount = Math.max(0, audioUnlockConsumerCount - 1);
    if (audioUnlockConsumerCount === 0) removeAudioUnlockListeners();
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== AUDIO_PREFERENCES_STORAGE_KEY) return;
    const preferences = readAudioPreferences();
    if (preferences.muted === muted && preferences.volume === volume) return;
    muted = preferences.muted;
    volume = preferences.volume;
    syncGainAndNotify();
  });
}

/** Returns the narrator submix bus for connecting narrator AudioBufferSourceNodes. */
export function getNarratorBusNode(): GainNode | null {
  return narratorBusGain;
}

/** Duck or unduck the SFX bus, music and ambience when the narrator is actively speaking. */
export function setNarratorDucking(active: boolean): void {
  if (narratorDucking === active) return;
  narratorDucking = active;
  if (!sfxBusGain || !audioContext) return;
  const now = audioContext.currentTime;
  const seconds = active ? DUCK_ATTACK_S : DUCK_RELEASE_S;
  rampParam(sfxBusGain.gain, active ? DUCK_GAIN : 1, now, seconds);
  if (bedNarratorDuck)
    rampParam(bedNarratorDuck.gain, active ? BED_NARRATOR_DUCK_GAIN : 1, now, seconds);
}
