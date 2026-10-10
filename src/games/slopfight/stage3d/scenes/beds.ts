// The stage's sound beds (pure): which music loop plays in each phase, and
// which loops sit under it. ui/stage-effects.tsx applies them in live rooms.

import type { MusicFamily } from "../../audio";
import type { StagePhase } from "../stage-input";

/** The music bed per phase family (the lobby has the crowd instead). */
export const PHASE_MUSIC: Record<StagePhase, MusicFamily | null> = {
  LOBBY: null,
  BUILD: "build",
  UPGRADE: "build",
  FOUNDRY: "foundry",
  ROSTER: "foundry",
  FACE_OFF: "fight",
  FIGHT: "fight",
  RESULT: "result",
  STANDINGS: "result",
  FINISHED: "result",
};

/** The crowd murmurs under the lobby while people join. */
export function crowdMurmurs(phase: StagePhase): boolean {
  return phase === "LOBBY";
}
