import { duck, getAudioContext, getNarratorBusNode, loadBuffer } from "@/lib/sounds";

/**
 * The tutorial's voice-over, played from any point on the shared audio context
 * so it follows the master mute and volume. The game's own beds dip for as
 * long as it plays.
 */
export class TutorialAudio {
  private voice: AudioBuffer | null = null;
  private node: AudioBufferSourceNode | null = null;
  /** Context time that tutorial time 0 maps to, while playing. */
  private origin: number | null = null;

  constructor(
    private readonly voiceSrc: string | null,
    private readonly duration: number,
  ) {}

  /** Loads the voice; resolves false when there is nothing to play or it failed. */
  async load(): Promise<boolean> {
    if (typeof window === "undefined" || !this.voiceSrc) return false;
    try {
      this.voice = await loadBuffer(this.voiceSrc, "tutorial voice");
      return true;
    } catch {
      return false;
    }
  }

  /** Where the audio is, in tutorial seconds, or null when it isn't playing. */
  position(): number | null {
    if (this.origin === null) return null;
    return getAudioContext().ctx.currentTime - this.origin;
  }

  /** Plays from tutorial time `from` (seconds), replacing whatever was playing. */
  play(from: number): void {
    this.stop();
    const bus = getNarratorBusNode();
    if (!this.voice || !bus || from >= this.duration) return;
    const { ctx } = getAudioContext();
    const start = ctx.currentTime + 0.03;
    this.origin = start - from;
    if (from < this.voice.duration) {
      const voice = ctx.createBufferSource();
      voice.buffer = this.voice;
      voice.connect(bus);
      voice.start(start, from);
      this.node = voice;
    }
    // Keep the room's own music and ambience under the tutorial.
    duck(0.15, (this.duration - from) * 1000);
  }

  stop(): void {
    if (this.node) {
      try {
        this.node.stop();
      } catch {
        // Already stopped.
      }
      this.node.disconnect();
      this.node = null;
    }
    this.origin = null;
  }
}
