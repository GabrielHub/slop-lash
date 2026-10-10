import type { GameType } from "@/games/core/types";
import type { Fixture } from "./base";
import { matchslopFixtures } from "./matchslop";
import { quizslopFixtures } from "./quizslop";
import { rematchFixtures } from "./rematch";
import { sloplashFixtures } from "./sloplash";

export type { Fixture } from "./base";

export const FIXTURES: Record<GameType, Fixture[]> = {
  SLOPLASH: [...sloplashFixtures, ...rematchFixtures("sloplash", sloplashFixtures)],
  MATCHSLOP: [...matchslopFixtures, ...rematchFixtures("matchslop", matchslopFixtures)],
  QUIZSLOP: [...quizslopFixtures, ...rematchFixtures("quizslop", quizslopFixtures)],
};

export function findFixture(id: string): Fixture | undefined {
  return Object.values(FIXTURES)
    .flat()
    .find((fixture) => fixture.id === id);
}
