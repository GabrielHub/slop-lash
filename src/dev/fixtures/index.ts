import type { GameType } from "@/games/core/types";
import type { Fixture } from "./base";
import { matchslopFixtures } from "./matchslop";
import { quizslopFixtures } from "./quizslop";
import { sloplashFixtures } from "./sloplash";

export type { Fixture } from "./base";

export const FIXTURES: Record<GameType, Fixture[]> = {
  SLOPLASH: sloplashFixtures,
  MATCHSLOP: matchslopFixtures,
  QUIZSLOP: quizslopFixtures,
};

export function findFixture(id: string): Fixture | undefined {
  return Object.values(FIXTURES)
    .flat()
    .find((fixture) => fixture.id === id);
}
