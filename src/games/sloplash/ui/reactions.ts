"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useRoom } from "@/room/context";
import type { SlPrompt } from "./data";

/** Only the controls and floating effects need the live reaction subscription. */
export function useSloplashReactions(prompt: SlPrompt) {
  const { view, capability, live } = useRoom();
  const subscribe = live && capability !== "fixture" && view.room.phase === "VOTING";
  const reactions = useQuery(
    api.sloplash.reactions.live,
    subscribe
      ? {
          roomCode: view.room.code,
          phaseGeneration: view.room.phaseGeneration,
          promptId: prompt.id,
          ...(capability ? { capability } : {}),
        }
      : "skip",
  );
  return subscribe ? reactions : prompt.liveReactions;
}
