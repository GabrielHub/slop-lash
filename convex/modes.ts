import type { GameType } from "../src/games/core/types";
import type { GameMode } from "./engine";
import type { JobHandler } from "./jobs";
import { matchslopJobHandlers, matchslopMode } from "./matchslop/mode";
import { quizslopMode } from "./quizslop/mode";
import { slopfightJobHandlers, slopfightMode } from "./slopfight/mode";
import { sloplashJobHandlers, sloplashMode } from "./sloplash/mode";

/** Every game mode the engine can run. */
const MODES: Record<GameType, GameMode> = {
  SLOPLASH: sloplashMode,
  MATCHSLOP: matchslopMode,
  QUIZSLOP: quizslopMode,
  SLOPFIGHT: slopfightMode,
};

/** Every AI job kind, keyed the same way as the runners in `jobRunner.ts`. */
const JOB_HANDLERS: Record<string, JobHandler> = {
  ...sloplashJobHandlers,
  ...matchslopJobHandlers,
  ...slopfightJobHandlers,
};

export function getMode(gameType: GameType): GameMode {
  return MODES[gameType];
}

/** Game types whose finished rooms are deleted after the retention window. */
export const DISPOSABLE_GAME_TYPES = (Object.keys(MODES) as GameType[]).filter(
  (gameType) => !MODES[gameType].keepsRecaps,
);

export function getJobHandler(kind: string): JobHandler {
  const handler = JOB_HANDLERS[kind];
  if (!handler) throw new Error(`Unknown job kind ${kind}`);
  return handler;
}
