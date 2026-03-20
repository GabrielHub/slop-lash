import type { GameState } from "./types";

type StreamLifecycleState = {
  gameType: GameState["gameType"];
  status: GameState["status"];
  modeState?: unknown;
  winnerTaglinePending?: boolean;
};

function hasPendingMatchSlopPostMortem(state: StreamLifecycleState): boolean {
  if (state.gameType !== "MATCHSLOP") return false;

  const modeState =
    state.modeState && typeof state.modeState === "object"
      ? (state.modeState as Record<string, unknown>)
      : null;
  const postMortemGeneration =
    modeState?.postMortemGeneration &&
    typeof modeState.postMortemGeneration === "object"
      ? (modeState.postMortemGeneration as Record<string, unknown>)
      : null;
  const status = postMortemGeneration?.status;

  return status === "NOT_REQUESTED" || status === "STREAMING";
}

function hasPendingSlopLashWinnerTagline(state: StreamLifecycleState): boolean {
  return state.gameType === "SLOPLASH" && state.winnerTaglinePending === true;
}

export function shouldKeepGameStreamAlive(
  state: StreamLifecycleState | null,
): boolean {
  if (!state) return true;
  if (state.status !== "FINAL_RESULTS") return true;

  return (
    hasPendingMatchSlopPostMortem(state) ||
    hasPendingSlopLashWinnerTagline(state)
  );
}

export function shouldEndGameStream(state: StreamLifecycleState): boolean {
  return !shouldKeepGameStreamAlive(state);
}
