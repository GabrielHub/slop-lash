const SOUND_MAP = {
  "game-start": "/sfx/Short_2-second_game___2-1771908035837.mp3",
  "phase-transition": "/sfx/Quick_0.5-second_who__1-1771908063128.mp3",
  "submitted": "/sfx/Short_0.3-second_suc__1-1771908098119.mp3",
  "vote-cast": "/sfx/Punchy_0.2-second_ta__3-1771908125774.mp3",
  "winner-reveal": "/sfx/1.5-second_triumphan__3-1771908176203.mp3",
  "celebration": "/sfx/big_celebration_fanf__2-1771908214520.mp3",
  "round-transition": "/sfx/1-second_short_music__4-1771908237860.mp3",
} as const;

export type SoundName = keyof typeof SOUND_MAP;

// --- Web Audio API state ---
let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
const bufferCache = new Map<SoundName, AudioBuffer>();

/** Returns the shared AudioContext + master GainNode (creates lazily). */
export function getAudioContext(): { ctx: AudioContext; gain: GainNode } {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = muted ? 0 : volume;
    masterGain.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return { ctx: audioContext, gain: masterGain! };
}

// --- Volume & mute state ---
let volume =
  typeof window !== "undefined"
    ? parseFloat(localStorage.getItem("soundsVolume") ?? "0.5")
    : 0.5;

let muted =
  typeof window !== "undefined"
    ? localStorage.getItem("soundsMuted") === "true"
    : false;

const audioListeners = new Set<() => void>();

/** Sync the master gain node and notify subscribers. */
function syncGainAndNotify(): void {
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : volume;
  }
  audioListeners.forEach((cb) => cb());
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
  // Cancel any in-progress browser TTS when muting
  if (muted && typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
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

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let preloaded = false;

export function preloadSounds(): void {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;

  const { ctx } = getAudioContext();

  for (const [name, path] of Object.entries(SOUND_MAP)) {
    fetch(path)
      .then((res) => res.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((audioBuffer) => {
        bufferCache.set(name as SoundName, audioBuffer);
      })
      .catch(() => {});
  }
}

export function playSound(name: SoundName): void {
  if (typeof window === "undefined" || muted || prefersReducedMotion()) return;

  const { ctx, gain } = getAudioContext();

  const buffer = bufferCache.get(name);
  if (buffer) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start();
  } else {
    // Fallback: fetch and decode on the fly
    fetch(SOUND_MAP[name])
      .then((res) => res.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((audioBuffer) => {
        bufferCache.set(name, audioBuffer);
        if (!muted) {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(gain);
          source.start();
        }
      })
      .catch(() => {});
  }
}
