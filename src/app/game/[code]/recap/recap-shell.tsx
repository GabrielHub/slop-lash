"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { StaticRoomProvider } from "@/room/context";
import { RoomSpinner } from "@/room/gate";
import { RoomFrame } from "@/room/shell";

/** A finished game's results, shareable with anyone who has the room code. */
export function RecapShell({ code, gameNumber }: { code: string; gameNumber: number }) {
  const recap = useQuery(api.views.recap, { roomCode: code, gameNumber });
  if (recap === undefined) return <RoomSpinner />;
  if (recap.kind !== "READY") {
    return (
      <main className="min-h-svh flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-fail font-display font-bold text-xl mb-3">
            {recap.kind === "NOT_FOUND" ? "Game not found" : "This game is still going"}
          </p>
          <Link
            href={recap.kind === "NOT_FOUND" ? "/" : `/stage/${code}`}
            className="text-sm font-medium text-teal hover:underline"
          >
            {recap.kind === "NOT_FOUND" ? "Back home" : "Watch it live"}
          </Link>
        </div>
      </main>
    );
  }
  return (
    <StaticRoomProvider view={recap.view}>
      <RoomFrame layout="recap" />
    </StaticRoomProvider>
  );
}
