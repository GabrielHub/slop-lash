"use client";

import { useState } from "react";
import Link from "next/link";
import { getFunctionName } from "convex/server";
import { StaticRoomProvider, type RoomRunner } from "@/room/context";
import { RoomFrame, type RoomLayout } from "@/room/shell";
import { FIXTURE_NOW } from "./fixtures/base";
import { findFixture } from "./fixtures";

const LAYOUTS: RoomLayout[] = ["stage", "controller", "game"];

const logOnly: RoomRunner = async (mutation, args) => {
  console.info("[fixture]", getFunctionName(mutation), args);
  return null as never;
};

/** Renders a fixture through the same frame as a live room, with mutations logged. */
export function FixtureScreen({ id, layout }: { id: string; layout: RoomLayout }) {
  const fixture = findFixture(id);
  // Freezes the fixture's clock at its own "now" so countdowns start full.
  const [clockOffsetMs] = useState(() => FIXTURE_NOW - Date.now());
  if (!fixture) return <p className="p-6 text-fail">Unknown fixture {id}</p>;
  return (
    <>
      <nav className="fixed bottom-3 left-3 z-50 flex gap-1 rounded-lg border border-edge bg-surface/90 p-1 text-xs shadow">
        <Link href="/dev/ui" className="px-2 py-1 text-ink-dim hover:text-ink">
          All
        </Link>
        {LAYOUTS.map((option) => (
          <Link
            key={option}
            href={`/dev/ui/${id}?layout=${option}`}
            className={`px-2 py-1 rounded ${option === layout ? "bg-raised text-ink" : "text-ink-dim hover:text-ink"}`}
          >
            {option}
          </Link>
        ))}
      </nav>
      <StaticRoomProvider
        view={fixture.view}
        capability="fixture"
        clockOffsetMs={clockOffsetMs}
        live
        run={logOnly}
      >
        <RoomFrame layout={layout} />
      </StaticRoomProvider>
    </>
  );
}
