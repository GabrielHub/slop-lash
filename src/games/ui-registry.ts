import type { GameType } from "@/games/core/types";
import type { GameUi } from "@/room/game-ui";
import { matchslopUi } from "@/games/matchslop/ui";
import { quizslopUi } from "@/games/quizslop/ui";
import { slopfightUi } from "@/games/slopfight/ui";
import { sloplashUi } from "@/games/sloplash/ui";

const GAME_UIS: Record<GameType, GameUi> = {
  SLOPLASH: sloplashUi,
  MATCHSLOP: matchslopUi,
  QUIZSLOP: quizslopUi,
  SLOPFIGHT: slopfightUi,
};

export function gameUi(gameType: GameType): GameUi {
  return GAME_UIS[gameType];
}
