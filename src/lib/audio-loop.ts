import type { LoopHandle, LoopOptions, SoundAsset } from "./sounds";

export function rampParam(param: AudioParam, value: number, at: number, seconds: number): void {
  param.cancelScheduledValues(at);
  param.setValueAtTime(param.value, at);
  param.linearRampToValueAtTime(value, at + Math.max(0.001, seconds));
}

export class AudioLoop implements LoopHandle {
  stopped = false;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  /** The fade asked for before the file finished loading. */
  private pending: { gain: number; seconds: number } | null = null;

  private context: AudioContext | null = null;

  constructor(private readonly trim: number) {}

  attach(
    ctx: AudioContext,
    buffer: AudioBuffer,
    asset: SoundAsset,
    options: LoopOptions,
    target: AudioNode | null,
  ): void {
    if (this.stopped) return;
    if (!target) return;
    this.context = ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const start = asset.loop?.start ?? 0;
    const end = asset.loop?.end ?? buffer.duration;
    source.loopStart = start;
    source.loopEnd = Math.min(end, buffer.duration);
    const rate = 2 ** ((options.semitones ?? 0) / 12);
    if (rate !== 1 && source.playbackRate) source.playbackRate.value = rate;
    const gainNode = ctx.createGain();
    const now = ctx.currentTime;
    const level = this.trim * (this.pending?.gain ?? 1);
    const fadeIn = Math.max(0.005, options.fadeIn ?? 0.05);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(level, now + fadeIn);
    source.connect(gainNode);
    gainNode.connect(target);
    this.source = source;
    this.gainNode = gainNode;
    this.pending = null;
    source.start(now, start);
  }

  fade(gain: number, seconds = 0.3): void {
    if (this.stopped) return;
    const value = Math.max(0, gain);
    if (!this.gainNode || !this.context) {
      this.pending = { gain: value, seconds };
      return;
    }
    rampParam(this.gainNode.gain, this.trim * value, this.context.currentTime, seconds);
  }

  stop(seconds = 0.3): void {
    if (this.stopped) return;
    this.stopped = true;
    const source = this.source;
    const gainNode = this.gainNode;
    if (!source || !gainNode || !this.context) return;
    const now = this.context.currentTime;
    const fadeOut = Math.max(0.005, seconds);
    rampParam(gainNode.gain, 0, now, fadeOut);
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
    };
    source.stop(now + fadeOut + 0.01);
  }
}
