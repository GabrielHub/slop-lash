"use client";

import { useRoom } from "@/room/context";
import { PhoneFinal } from "./phone-final";
import { PhoneReveal, PhoneVoting } from "./phone-matchup";
import { PhoneRoundResults } from "./phone-results";
import { PhoneWriting } from "./phone-writing";

/** A player's phone: one screen per phase. */
export function Controller() {
  const { room } = useRoom().view;
  if (room.status === "FINISHED") return <PhoneFinal />;
  switch (room.phase) {
    case "WRITING":
      return <PhoneWriting />;
    case "VOTING":
      return <PhoneVoting />;
    case "REVEAL":
      return <PhoneReveal />;
    case "ROUND_RESULTS":
      return <PhoneRoundResults />;
    default:
      return null;
  }
}
