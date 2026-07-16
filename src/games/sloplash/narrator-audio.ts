import { getAudioContext, getNarratorBusNode } from "@/lib/sounds";

const INITIAL_BUFFER_S = 0.05;
const STALE_THRESHOLD_S = 3;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/** Schedules complete encoded speech clips on the shared narrator audio bus. */
export class NarratorPlaybackQueue {
  private nextPlayAt = 0;
  private activeSources = 0;
  private destroyed = false;
  private generation = 0;
  private sourcesInFlight = new Set<AudioBufferSourceNode>();

  constructor(private readonly onActiveChange: (active: boolean) => void) {}

  async enqueueEncoded(base64: string): Promise<void> {
    if (this.destroyed) return;
    const busNode = getNarratorBusNode();
    if (!busNode) return;
    const { ctx } = getAudioContext();
    // Decoding is async, so a clear() can land mid-flight. Anything queued
    // before that clear must not reach the speakers.
    const generation = this.generation;
    const buffer = await ctx.decodeAudioData(base64ToArrayBuffer(base64));
    if (this.destroyed || generation !== this.generation) return;

    const now = ctx.currentTime;
    if (this.nextPlayAt < now - STALE_THRESHOLD_S) this.nextPlayAt = 0;
    const startAt = this.nextPlayAt > now ? this.nextPlayAt : now + INITIAL_BUFFER_S;
    this.nextPlayAt = startAt + buffer.duration;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(busNode);
    this.activeSources++;
    this.sourcesInFlight.add(source);
    if (this.activeSources === 1) this.onActiveChange(true);

    source.onended = () => {
      const wasTracked = this.sourcesInFlight.delete(source);
      source.disconnect();
      if (!wasTracked || this.destroyed) return;
      this.activeSources = Math.max(0, this.activeSources - 1);
      if (this.activeSources === 0) this.onActiveChange(false);
    };

    source.start(startAt);
  }

  clear(): void {
    const wasActive = this.activeSources > 0;
    this.generation++;
    this.nextPlayAt = 0;
    for (const source of this.sourcesInFlight) {
      try {
        source.stop();
      } catch {
        // The source already ended.
      }
    }
    this.sourcesInFlight.clear();
    this.activeSources = 0;
    if (wasActive) this.onActiveChange(false);
  }

  destroy(): void {
    this.clear();
    this.destroyed = true;
  }
}
