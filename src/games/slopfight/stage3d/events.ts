// Stage beats as typed events, so sound (and anything else) can lock to
// motion: "a visual beat without a sound is a bug" (spec 6). The stage core
// emits these; scenes and the audio layer subscribe.

import type { ShotId } from "./director/shots";

export type TransitionKind = "cut" | "slam" | "wipe" | "letterboxIn" | "letterboxOut" | "iris" | "matchCut";

export interface StageEventMap {
  /** The director cut to a new shot. */
  cut: { from: ShotId | null; to: ShotId };
  /** A transition started, reached its covered moment, or finished. */
  transition: { kind: TransitionKind; phase: "start" | "cover" | "end" };
  /** A slam title hit the centre of the screen. */
  slam: { text: string };
  /** stage.impact(): an impact frame with hit stop. */
  impact: { strength: number; big: boolean };
  /** A slow-motion window opened. */
  slowmo: { scale: number; durationMs: number };
  /** The crowd cheered. */
  cheer: { strength: number };
  /**
   * The presentation clock dropped its hit-stop / slow-mo debt (on a hard cut
   * or a phase cover): `clock.now` jumped forward by `droppedMs`. Sim playback
   * should settle the skipped span without replaying its effects.
   */
  resync: { droppedMs: number };
}

export type StageEventName = keyof StageEventMap;
type Handler<K extends StageEventName> = (payload: StageEventMap[K]) => void;

export class StageEvents {
  private readonly handlers = new Map<StageEventName, Set<(payload: never) => void>>();

  on<K extends StageEventName>(name: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as (payload: never) => void);
    return () => set.delete(handler as (payload: never) => void);
  }

  emit<K extends StageEventName>(name: K, payload: StageEventMap[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of set) (handler as Handler<K>)(payload);
  }
}
