import { getAudioContext, getNarratorBusNode } from "./sounds";

const NARRATOR_SAMPLE_RATE = 24_000;
const INITIAL_BUFFER_S = 0.05;
const STALE_THRESHOLD_S = 3;

/** Decode Gemini Live API base64 output to PCM16 samples. */
export function base64ToPCM(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Convert PCM16 samples to Float32 for Web Audio API. */
export function pcm16ToFloat32(int16: Int16Array): Float32Array {
  const float = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 32768;
  return float;
}

/**
 * Gapless narrator audio playback queue.
 *
 * Schedules PCM chunks as AudioBufferSourceNodes on the narrator bus,
 * using Web Audio clock-based lookahead for seamless playback.
 * Drives SFX ducking based on actual playback activity.
 */
export class NarratorPlaybackQueue {
  private nextPlayAt = 0;
  private activeSources = 0;
  private destroyed = false;
  private sourcesInFlight = new Set<AudioBufferSourceNode>();
  private onActiveChange: (active: boolean) => void;

  constructor(onActiveChange: (active: boolean) => void) {
    this.onActiveChange = onActiveChange;
  }

  enqueue(float32: Float32Array): void {
    const busNode = getNarratorBusNode();
    if (!busNode) return;
    const { ctx } = getAudioContext();

    const buffer = ctx.createBuffer(1, float32.length, NARRATOR_SAMPLE_RATE);
    buffer.copyToChannel(float32 as Float32Array<ArrayBuffer>, 0);

    const now = ctx.currentTime;

    if (this.nextPlayAt < now - STALE_THRESHOLD_S) {
      this.nextPlayAt = 0;
    }

    const startAt =
      this.nextPlayAt > now ? this.nextPlayAt : now + INITIAL_BUFFER_S;

    this.nextPlayAt = startAt + buffer.duration;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(busNode);

    this.activeSources++;
    this.sourcesInFlight.add(source);
    if (this.activeSources === 1) {
      this.onActiveChange(true);
    }

    source.onended = () => {
      source.disconnect();
      this.sourcesInFlight.delete(source);
      if (this.destroyed) return;
      this.activeSources = Math.max(0, this.activeSources - 1);
      if (this.activeSources === 0) {
        this.onActiveChange(false);
      }
    };

    source.start(startAt);
  }

  clear(): void {
    this.nextPlayAt = 0;
    for (const src of this.sourcesInFlight) {
      try { src.stop(); } catch { /* already ended */ }
    }
    this.sourcesInFlight.clear();
    this.activeSources = 0;
  }

  destroy(): void {
    this.destroyed = true;
    this.clear();
  }
}
