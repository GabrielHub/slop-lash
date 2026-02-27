const SOUND_MAP = {
  // Shared sounds (used by both sloplash and chatslop)
  "game-start": "/sfx/shared/game-start.mp3",
  "phase-transition": "/sfx/shared/phase-transition.mp3",
  "submitted": "/sfx/shared/submitted.mp3",
  "vote-cast": "/sfx/shared/vote-cast.mp3",
  "winner-reveal": "/sfx/shared/winner-reveal.mp3",
  "celebration": "/sfx/shared/celebration.mp3",
  "round-transition": "/sfx/shared/round-transition.mp3",
  "game-over": "/sfx/shared/game-over.mp3",
  "player-join": "/sfx/shared/player-join.mp3",
  "player-leave": "/sfx/shared/player-leave.mp3",
  // Sloplash-specific sounds
  "stamp-slam": "/sfx/sloplash/stamp-slam.mp3",
  "vote-reveal": "/sfx/sloplash/vote-reveal.mp3",
  "timer-warning": "/sfx/sloplash/timer-warning.mp3",
  "prompt-advance": "/sfx/sloplash/prompt-advance.mp3",
  // Chatslop-specific sounds
  "chat-send": "/sfx/chatslop/chat-send.mp3",
  "chat-receive": "/sfx/chatslop/chat-receive.mp3",
  "all-in": "/sfx/chatslop/all-in.mp3",
  "round-start": "/sfx/chatslop/round-start.mp3",
  "player-ready": "/sfx/chatslop/player-ready.mp3",
} as const;

export type SoundName = keyof typeof SOUND_MAP;
export const SOUND_NAMES = Object.keys(SOUND_MAP) as SoundName[];

/** Fade-in duration in seconds to soften aggressive starts. */
const DEFAULT_FADE_IN_S = 0.02;
/** Fade-out duration in seconds to reduce abrupt tails. */
const DEFAULT_FADE_OUT_S = 0.02;

// --- Web Audio API state ---
let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let sfxBusGain: GainNode | null = null;
let narratorBusGain: GainNode | null = null;
const bufferCache = new Map<SoundName, AudioBuffer>();
const inflightBufferLoads = new Map<SoundName, Promise<AudioBuffer>>();
const lastPlayAtMs = new Map<SoundName, number>();
let resumePromise: Promise<void> | null = null;

// --- Narrator ducking ---
let narratorDucking = false;
const DUCK_GAIN = 0.35;
const DUCK_ATTACK_S = 0.03;
const DUCK_RELEASE_S = 0.25;

const SOUND_COOLDOWN_MS: Partial<Record<SoundName, number>> = {
  "vote-cast": 60,
  "prompt-advance": 120,
  "player-join": 200,
  "player-leave": 200,
  "submitted": 80,
  "chat-send": 100,
  "chat-receive": 150,
};

// Per-sound trim multipliers (linear gain) to normalize AI-generated SFX.
// 1.0 = unchanged, <1.0 quieter, >1.0 louder.
const DEFAULT_SOUND_GAIN_MULTIPLIER: Partial<Record<SoundName, number>> = {
  "celebration": 0.75,
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
  "player-ready": 0.7,
};

type SoundTuningStorage = {
  fadeInS?: number;
  fadeOutS?: number;
  gains?: Partial<Record<SoundName, number>>;
};

const SOUND_TUNING_STORAGE_KEY = "soundsTuningV1";
let fadeInS = DEFAULT_FADE_IN_S;
let fadeOutS = DEFAULT_FADE_OUT_S;
let soundGainMultiplier: Partial<Record<SoundName, number>> = { ...DEFAULT_SOUND_GAIN_MULTIPLIER };

/** Returns the shared AudioContext + master GainNode (creates lazily). */
export function getAudioContext(): { ctx: AudioContext; gain: GainNode } {
  if (!audioContext) {
    audioContext = new AudioContext();

    // Compressor for volume normalization across all sounds
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 12;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    masterGain = audioContext.createGain();
    masterGain.gain.value = muted ? 0 : volume;

    // Submix buses under masterGain
    sfxBusGain = audioContext.createGain();
    sfxBusGain.gain.value = 1;
    narratorBusGain = audioContext.createGain();
    narratorBusGain.gain.value = 1;

    // SFX bus → compressor → master → destination
    sfxBusGain.connect(compressor);
    compressor.connect(masterGain);
    // Narrator bus → master → destination (bypasses compressor)
    narratorBusGain.connect(masterGain);
    masterGain.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return { ctx: audioContext, gain: masterGain! };
}

// --- Volume & mute state ---
let volume = (() => {
  if (typeof window === "undefined") return 0.5;
  const parsed = parseFloat(localStorage.getItem("soundsVolume") ?? "");
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.5;
})();

let muted =
  typeof window !== "undefined"
    ? localStorage.getItem("soundsMuted") === "true"
    : false;

const audioListeners = new Set<() => void>();
let audioStateVersion = 0;

/** Sync the master gain node and notify subscribers. */
function syncGainAndNotify(): void {
  audioStateVersion += 1;
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : volume;
  }
  audioListeners.forEach((cb) => cb());
}

function persistSoundTuning(): void {
  if (typeof window === "undefined") return;
  const payload: SoundTuningStorage = {
    fadeInS,
    fadeOutS,
    gains: soundGainMultiplier,
  };
  localStorage.setItem(SOUND_TUNING_STORAGE_KEY, JSON.stringify(payload));
}

function loadSoundTuningFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(SOUND_TUNING_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as SoundTuningStorage;
    if (typeof parsed.fadeInS === "number" && Number.isFinite(parsed.fadeInS)) {
      fadeInS = Math.max(0, Math.min(0.5, parsed.fadeInS));
    }
    if (typeof parsed.fadeOutS === "number" && Number.isFinite(parsed.fadeOutS)) {
      fadeOutS = Math.max(0, Math.min(0.5, parsed.fadeOutS));
    }
    if (parsed.gains && typeof parsed.gains === "object") {
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
  volume = Math.max(0, Math.min(1, v));
  if (typeof window !== "undefined") {
    localStorage.setItem("soundsVolume", String(volume));
  }
  // Dragging up from 0 while muted → auto-unmute
  if (volume > 0 && muted) {
    muted = false;
    if (typeof window !== "undefined") {
      localStorage.setItem("soundsMuted", "false");
    }
  }
  syncGainAndNotify();
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  // Unmuting while volume is 0 → restore to a sane default
  if (!muted && volume === 0) {
    volume = 0.5;
    if (typeof window !== "undefined") {
      localStorage.setItem("soundsVolume", "0.5");
    }
  }
  if (typeof window !== "undefined") {
    localStorage.setItem("soundsMuted", String(muted));
  }
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
    localStorage.removeItem(SOUND_TUNING_STORAGE_KEY);
  }
  syncGainAndNotify();
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let preloaded = false;

export function preloadSounds(): void {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;

  getAudioContext();

  for (const name of Object.keys(SOUND_MAP) as SoundName[]) {
    void loadSoundBuffer(name).catch(() => {});
  }
}

function shouldThrottleSound(name: SoundName): boolean {
  const cooldownMs = SOUND_COOLDOWN_MS[name];
  if (!cooldownMs) return false;

  const now = performance.now();
  const last = lastPlayAtMs.get(name) ?? -Infinity;
  if (now - last < cooldownMs) return true;
  lastPlayAtMs.set(name, now);
  return false;
}

function ensureAudioContextRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === "running") return Promise.resolve();
  if (resumePromise) return resumePromise;

  resumePromise = ctx
    .resume()
    .catch(() => {})
    .finally(() => {
      resumePromise = null;
    });

  return resumePromise;
}

function loadSoundBuffer(name: SoundName): Promise<AudioBuffer> {
  const cached = bufferCache.get(name);
  if (cached) return Promise.resolve(cached);

  const inflight = inflightBufferLoads.get(name);
  if (inflight) return inflight;

  const { ctx } = getAudioContext();
  const request = fetch(SOUND_MAP[name])
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load sound: ${name}`);
      return res.arrayBuffer();
    })
    .then((buf) => ctx.decodeAudioData(buf))
    .then((audioBuffer) => {
      bufferCache.set(name, audioBuffer);
      return audioBuffer;
    })
    .finally(() => {
      inflightBufferLoads.delete(name);
    });

  inflightBufferLoads.set(name, request);
  return request;
}

export function playSound(name: SoundName): void {
  if (typeof window === "undefined" || muted || prefersReducedMotion()) return;
  if (shouldThrottleSound(name)) return;

  const { ctx } = getAudioContext();

  function play(buffer: AudioBuffer): void {
    const target = sfxBusGain ?? compressor ?? masterGain;
    if (!target) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const soundGain = Math.max(0, soundGainMultiplier[name] ?? 1);
    const localFadeInS = fadeInS;
    const localFadeOutS = fadeOutS;

    // Per-sound fade-in gain to soften aggressive starts
    const fadeGain = ctx.createGain();
    const startAt = ctx.currentTime;
    const duration = buffer.duration;
    const safeDuration = Math.max(0, duration - 0.001);
    const effectiveFadeIn = Math.min(Math.max(0, localFadeInS), safeDuration);
    const effectiveFadeOut = Math.min(
      Math.max(0, localFadeOutS),
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

    // Chain: source → fadeGain → compressor → masterGain → destination
    source.connect(fadeGain);
    fadeGain.connect(target);
    source.onended = () => {
      source.disconnect();
      fadeGain.disconnect();
    };
    source.start();
  }

  function playWhenRunning(buffer: AudioBuffer): void {
    if (ctx.state === "running") {
      play(buffer);
      return;
    }

    void ensureAudioContextRunning(ctx).then(() => {
      if (!muted && ctx.state === "running") {
        play(buffer);
      }
    });
  }

  void loadSoundBuffer(name)
    .then((audioBuffer) => {
      if (!muted) playWhenRunning(audioBuffer);
    })
    .catch(() => {});
}

/** Returns the narrator submix bus for connecting narrator AudioBufferSourceNodes. */
export function getNarratorBusNode(): GainNode | null {
  return narratorBusGain;
}

/** Duck or unduck the SFX bus when the narrator is actively speaking. */
export function setNarratorDucking(active: boolean): void {
  if (narratorDucking === active) return;
  narratorDucking = active;
  if (!sfxBusGain || !audioContext) return;
  const now = audioContext.currentTime;
  sfxBusGain.gain.cancelScheduledValues(now);
  if (active) {
    sfxBusGain.gain.setValueAtTime(sfxBusGain.gain.value, now);
    sfxBusGain.gain.linearRampToValueAtTime(DUCK_GAIN, now + DUCK_ATTACK_S);
  } else {
    sfxBusGain.gain.setValueAtTime(sfxBusGain.gain.value, now);
    sfxBusGain.gain.linearRampToValueAtTime(1, now + DUCK_RELEASE_S);
  }
}
