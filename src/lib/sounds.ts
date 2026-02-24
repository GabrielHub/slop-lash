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

const audioCache = new Map<SoundName, HTMLAudioElement>();

let preloaded = false;

// --- Mute state ---
let muted =
  typeof window !== "undefined"
    ? localStorage.getItem("soundsMuted") === "true"
    : false;

const muteListeners = new Set<() => void>();

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (typeof window !== "undefined") {
    localStorage.setItem("soundsMuted", String(muted));
  }
  muteListeners.forEach((cb) => cb());
  return muted;
}

export function subscribeMute(cb: () => void): () => void {
  muteListeners.add(cb);
  return () => {
    muteListeners.delete(cb);
  };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function preloadSounds() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;

  for (const [name, path] of Object.entries(SOUND_MAP)) {
    const audio = new Audio(path);
    audio.preload = "auto";
    audioCache.set(name as SoundName, audio);
  }
}

export function playSound(name: SoundName) {
  if (typeof window === "undefined" || muted || prefersReducedMotion()) return;

  if (!preloaded) preloadSounds();

  let audio = audioCache.get(name);
  if (audio) {
    // Reset to start so rapid replays work
    audio.currentTime = 0;
  } else {
    audio = new Audio(SOUND_MAP[name]);
    audioCache.set(name, audio);
  }

  audio.play().catch(() => {
    // Browser blocked autoplay — silently ignore
  });
}
