import type { ComponentType } from "react";
import type { AmbientEnergy, AmbientScene } from "@/lib/ambient-events";
import type { GameMeta } from "@/games/meta";
import type { RoomView } from "./context";

/** A stage-only interstitial: "ROUND 2 · ×2 points", "Final round", "Meet Nora". */
export interface TitleCardSpec {
  /** Shown once per id, on a fresh live change; a recap or late open skips it. */
  id: string;
  /** Small line above the title, e.g. "Round 2". */
  kicker?: string;
  title: string;
  tone: "punch" | "teal" | "gold";
  /** Seconds the card holds after its wipe. Defaults to `DUR.hold`. */
  hold?: number;
}

/** Which pieces of the shell's own chrome show for a view. */
export interface ShellChrome {
  /** The TV's top rail (wordmark, round, join chip, countdown ring). */
  stageRail: boolean;
  /** The phone's top bar (name, countdown pill, time line). */
  phoneBar: boolean;
}

/**
 * How a game draws itself. The shared shell owns the frame (header, timer,
 * lobby, host controls, reconnects, transitions, background); a game fills in
 * two screens:
 *
 * - `Stage` is the shared big screen everyone watches.
 * - `Controller` is one player's private phone screen.
 *
 * `/stage` shows only the stage, `/controller` only the controller, and
 * `/game` docks the controller beside the stage for players on a desktop.
 * Both read the room through `useRoom()` / `useModeView(kind)`.
 */
export interface GameUi extends Pick<GameMeta, "name" | "tagline"> {
  /** Sets `data-game` on the shell (and <html>) so the game's CSS variables apply. */
  theme: GameMeta["theme"];
  /** Three how-to steps of six words or fewer each, shown on the stage lobby. */
  howTo: readonly [string, string, string];
  /** The ambient background field for this game. */
  ambient: AmbientScene;
  /** Shown after the lobby, through to the final results (from the lobby on, with `ownsLobby`). */
  Stage: ComponentType;
  Controller: ComponentType;
  /** Extra lobby content, e.g. a persona strip or a topic picker. */
  StageLobby?: ComponentType;
  ControllerLobby?: ComponentType;
  /** Runs for as long as a stage is open, e.g. narration or sound cues. */
  StageEffects?: ComponentType;
  /**
   * The game draws its own lobby: the shell renders `Stage` and `Controller`
   * in LOBBY too (instead of its lobby), keeps one stage scene from LOBBY
   * into play (so a canvas never remounts; `sceneKey` still wins if given),
   * and opens the game without its "Round 1" title card. The game then owns
   * the join code, the player list and the host's Start: see `useLobby` and
   * the lobby parts exported from `src/room/lobby.tsx`.
   */
  ownsLobby?: boolean;
  /**
   * Which shell chrome shows for this view; both by default. A hidden rail or
   * phone bar takes its countdown with it, while the host dock, mute and the
   * ⋯ menu stay reachable from a small corner button.
   */
  chrome?(view: RoomView): ShellChrome;
  /** Extra host rows in the phone's ⋯ sheet, e.g. a retry for failed AI work. Style rows with `MENU_ROW`. */
  HostExtras?: ComponentType<{ onDone: () => void }>;
  /** A short name for the current phase, e.g. "Voting 3/5". */
  phaseLabel(view: RoomView): string;
  /** What the host's skip control says in the current phase: where it goes, not what it ends. */
  advanceLabel(view: RoomView): string;
  /**
   * Groups phases that share one stage layout, so it stays mounted (and
   * animates in place) across them. Defaults to one scene per
   * status/phase/round/step. Example: SlopLash's VOTING and REVEAL of a
   * matchup share `matchup:${round}:${step}`.
   */
  sceneKey?(view: RoomView): string;
  /** A stage title card for this view, or null. */
  titleCard?(view: RoomView): TitleCardSpec | null;
  /** The stage draws its own hero countdown here, so the shell hides its clock. */
  ownsStageClock?(view: RoomView): boolean;
  /** The game plays its own sound on entering this view, so the shell's phase cue stays quiet. */
  playsOwnPhaseCue?(view: RoomView): boolean;
  /** Whether this seat still has something to do in this phase (drives the "your turn" nudge). */
  needsInput?(view: RoomView): boolean;
  /** The background's energy for this view. Defaults to "calm". */
  ambientEnergy?(view: RoomView): AmbientEnergy;
}
