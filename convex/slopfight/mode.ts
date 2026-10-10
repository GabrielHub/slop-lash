import { timed, type GameMode } from "../engine";
import type { JobHandlers } from "../jobs";
import { BUILD_SECONDS, MAX_PLAYERS, MIN_PLAYERS } from "../../src/games/slopfight/constants";

// Foundation stub: SlopFight is registered end to end and opens BUILD. The
// Backend workstream owns this file and replaces it with the real phases
// (build plan 3.6).

/** SlopFight's AI job kinds, declared once and keyed like the runners in `runners.ts`. */
export type SlopfightJobs = Record<never, { input: unknown; output: unknown }>;

export const slopfightJobHandlers: JobHandlers<SlopfightJobs> = {};

export const slopfightMode: GameMode = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  keepsRecaps: true,

  async start(_ctx, game) {
    return { phase: "BUILD", seconds: timed(game, BUILD_SECONDS) };
  },

  async isComplete() {
    return false;
  },

  async next() {
    return "FINISH";
  },
};
