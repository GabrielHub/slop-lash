"use client";

import { createContext, useContext } from "react";
import type { GameUi } from "./game-ui";

// The shell selects the game once. Shared room parts consume it without
// importing the registry, whose game screens also depend on those parts.
const GameUiContext = createContext<GameUi | null>(null);

export const GameUiProvider = GameUiContext.Provider;

export function useGameUi(): GameUi {
  const ui = useContext(GameUiContext);
  if (!ui) throw new Error("useGameUi must be used inside a room frame");
  return ui;
}
