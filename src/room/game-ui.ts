import type { ComponentType } from "react";
import type { RoomView } from "./context";

/**
 * How a game draws itself. The shared shell owns the frame (header, timer,
 * lobby, host controls, reconnects); a game fills in two screens:
 *
 * - `Stage` is the shared big screen everyone watches.
 * - `Controller` is one player's private phone screen.
 *
 * `/stage` shows only the stage, `/controller` only the controller, and
 * `/game` docks the controller beside the stage for players on a desktop.
 * Both read the room through `useRoom()` / `useModeView(kind)`.
 */
export interface GameUi {
  name: string;
  /** Sets `data-game` on the shell so the game's CSS variables apply. */
  theme?: "matchslop" | "quizslop";
  /** Shown after the lobby, through to the final results. */
  Stage: ComponentType;
  Controller: ComponentType;
  /** Extra lobby content, e.g. a persona preview or a topic picker. */
  StageLobby?: ComponentType;
  ControllerLobby?: ComponentType;
  /** Runs for as long as a stage is open, e.g. narration or sound cues. */
  StageEffects?: ComponentType;
  /** A short name for the current phase in the header. */
  phaseLabel(view: RoomView): string;
  /** What the host's "next" button says in the current phase. */
  advanceLabel(view: RoomView): string;
}
