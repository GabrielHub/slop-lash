// Sound for in-scene beats, gated on a live room (spec 6: "a visual beat
// without a sound is a bug"; recaps and dev views stay quiet). The canvas
// copies `input.live` onto `services.live`; kit components and scenes play
// through `stageSfx(services)` so the gate lives in one place.

import { sfx, type SfxName, type SfxOptions } from "../../audio";
import type { StageServices } from "../services";

export interface StageSfx {
  play(name: SfxName, options?: SfxOptions): void;
  /** True in a live room (sounds play). */
  readonly live: boolean;
}

export function stageSfx(services: Pick<StageServices, "live">): StageSfx {
  return {
    play(name, options) {
      if (!services.live) return;
      try {
        sfx.play(name, options);
      } catch {
        // Audio is decoration: a failed cue must never break a frame.
      }
    },
    get live() {
      return services.live;
    },
  };
}
