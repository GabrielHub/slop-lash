import type { GameType } from "@/games/core/types";
import type { PreviewLoader } from "./preview";

/**
 * Every game's preview spot, loaded on demand: the host page fetches only the
 * picked game's, and warms another's when a pointer lands on its card.
 */
export const PREVIEWS: Record<GameType, PreviewLoader> = {
  SLOPLASH: () => import("@/games/sloplash/preview/spot").then((module) => module.spot),
  MATCHSLOP: () => import("@/games/matchslop/preview/spot").then((module) => module.spot),
  QUIZSLOP: () => import("@/games/quizslop/preview/spot").then((module) => module.spot),
  SLOPFIGHT: () => import("@/games/slopfight/preview/spot").then((module) => module.spot),
};
