// The phase-scene registry. Wave 3 workstreams add their phase's scene here
// (one line each); a phase without an entry shows the placeholder (the phase
// name on the marquee). A scene receives the stage input and the arena's
// named nodes, renders inside the persistent canvas, and reaches the
// director, transitions, clock, crowd and post-fx through the services hooks.

import type { ComponentType } from "react";
import { FaceOffScene, FightScene, ResultScene } from "../fight/scenes";
import type { StagePhase } from "../stage-input";
import { ForgeFloorScene } from "./forge-floor";
import { LobbyScene } from "./lobby";
import type { PhaseSceneProps } from "./phase-scene";
import { PodiumScene } from "./podium";
import { RosterScene } from "./roster";
import { StandingsScene } from "./standings";

export const PHASE_SCENES: Partial<Record<StagePhase, ComponentType<PhaseSceneProps>>> = {
  // Scenes workstream (stage3d/scenes/).
  LOBBY: LobbyScene,
  BUILD: ForgeFloorScene,
  FOUNDRY: ForgeFloorScene,
  UPGRADE: ForgeFloorScene,
  ROSTER: RosterScene,
  STANDINGS: StandingsScene,
  FINISHED: PodiumScene,
  // Fight workstream (stage3d/fight/scenes.tsx).
  FACE_OFF: FaceOffScene,
  FIGHT: FightScene,
  RESULT: ResultScene,
};
