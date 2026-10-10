import type { RoomView } from "@/room/context";

const PHASE_LABELS: Record<string, string> = {
  BUILD: "Build",
  FOUNDRY: "The Foundry",
  ROSTER: "Roster",
  FACE_OFF: "Face-off",
  FIGHT: "Fight",
  RESULT: "Result",
  STANDINGS: "Standings",
  UPGRADE: "Upgrade",
};

const ADVANCE_LABELS: Record<string, string> = {
  BUILD: "Forge what we have",
  FOUNDRY: "Stop waiting",
  ROSTER: "To the face-off",
  FACE_OFF: "Close the bets",
  FIGHT: "Skip to the result",
  RESULT: "Next fight",
  STANDINGS: "To the upgrades",
  UPGRADE: "Forge the upgrades",
};

export function phaseLabel(view: RoomView): string {
  if (view.room.status === "FINISHED") return "Results";
  return PHASE_LABELS[view.room.phase] ?? view.room.phase;
}

export function advanceLabel(view: RoomView): string {
  return ADVANCE_LABELS[view.room.phase] ?? "Skip ahead";
}

/** This seat still has something to do: make (or upgrade) its champion, or bet on the fight. */
export function needsInput(view: RoomView): boolean {
  const mode = view.mode;
  if (view.room.status !== "PLAYING" || mode.kind !== "SLOPFIGHT" || !view.me) return false;
  const mine = mode.fighters.find((fighter) => fighter.id === mode.myFighterId);
  switch (view.room.phase) {
    case "BUILD":
      return mine !== undefined && mine.status !== "FORGING" && mine.status !== "READY";
    case "UPGRADE":
      return mine !== undefined && mine.version < view.room.round && mine.status !== "FORGING";
    case "FACE_OFF":
      return mode.fights.find((fight) => fight.id === mode.currentFightId)?.mine === null;
    default:
      return false;
  }
}
