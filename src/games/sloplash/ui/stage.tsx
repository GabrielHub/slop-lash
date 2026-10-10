"use client";

import { useRoom } from "@/room/context";
import { StageFinal } from "./stage-final";
import { StageMatchup } from "./stage-matchup";
import { StageRoundResults } from "./stage-results";
import { StageWriting } from "./stage-writing";

/** The TV: one scene per phase (VOTING and REVEAL share the matchup scene). */
export function Stage() {
  const { room } = useRoom().view;
  if (room.status === "FINISHED") return <StageFinal />;
  switch (room.phase) {
    case "WRITING":
      return <StageWriting />;
    case "VOTING":
    case "REVEAL":
      return <StageMatchup />;
    case "ROUND_RESULTS":
      return <StageRoundResults />;
    default:
      return null;
  }
}
