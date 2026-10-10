"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getFunctionName } from "convex/server";
import {
  StaticRoomProvider,
  readHydrationClock,
  type RoomRunner,
  type RoomView,
} from "@/room/context";
import { RoomFrame, type RoomLayout } from "@/room/shell";
import { useHydrated } from "@/hooks/use-hydrated";
import { FIXTURE_NOW } from "./fixtures/base";
import { FIXTURES, findFixture, type Fixture } from "./fixtures";

/** The frames a fixture can render in; "recap" is the shareable results page's stage. */
export type FixtureLayout = RoomLayout | "recap";

const LAYOUTS: FixtureLayout[] = ["stage", "controller", "game", "recap"];

const logOnly: RoomRunner = async (mutation, args) => {
  console.info("[fixture]", getFunctionName(mutation), args);
  return null as never;
};

/** The fixtures of the game `id` belongs to, in order. */
function siblingsOf(id: string): Fixture[] {
  return Object.values(FIXTURES).find((list) => list.some((fixture) => fixture.id === id)) ?? [];
}

/**
 * Moves the phase to start at `now`, keeping its length, so its moments play
 * from the top. Each step also gets a newer phase generation, as a live phase
 * change does, so anything keyed on it (a disarmed two-tap) behaves as live.
 */
function rebase(view: RoomView, now: number, generation: number): RoomView {
  const { phaseStartedAt, phaseDeadline } = view.room;
  const shift = now - phaseStartedAt;
  return {
    ...view,
    room: {
      ...view.room,
      phaseGeneration: Math.max(view.room.phaseGeneration, generation),
      phaseStartedAt: now,
      phaseDeadline: phaseDeadline === null ? null : phaseDeadline + shift,
    },
  };
}

function typing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/**
 * Renders a fixture through the same frame as a live room, with mutations
 * logged. A small dev nav (bottom left) steps through the same game's
 * fixtures (prev/next, or the arrow keys) without remounting the room, so
 * phase transitions play as they would live, and replays the current one (R):
 * its phase restarts now and the frame remounts, so entrances and moments
 * play again together. The first load is settled: its moments are
 * already over, which keeps screenshots stable.
 */
export function FixtureScreen({ id, layout }: { id: string; layout: FixtureLayout }) {
  // The fixture clock reads FIXTURE_NOW at mount and runs on from there. While
  // hydrating, offset from the hydration clock, so the server render and
  // hydration both read exactly FIXTURE_NOW.
  const hydrated = useHydrated();
  const [clockOffsetMs] = useState(
    () => FIXTURE_NOW - (hydrated ? Date.now() : readHydrationClock()),
  );
  // `take` remounts the frame on a replay, so entrances play again with the moments.
  const [shown, setShown] = useState(() => ({ id, view: findFixture(id)?.view ?? null, take: 0 }));
  const siblings = siblingsOf(shown.id);
  const index = siblings.findIndex((fixture) => fixture.id === shown.id);

  const show = useCallback(
    (fixture: Fixture, again = false) => {
      setShown((previous) => ({
        id: fixture.id,
        view: rebase(
          fixture.view,
          Date.now() + clockOffsetMs,
          (previous.view?.room.phaseGeneration ?? 0) + 1,
        ),
        take: previous.take + (again ? 1 : 0),
      }));
      window.history.replaceState(
        window.history.state,
        "",
        `/dev/ui/${fixture.id}?layout=${layout}`,
      );
    },
    [clockOffsetMs, layout],
  );
  const step = useCallback(
    (by: number) => {
      const next = siblings[index + by];
      if (next) show(next);
    },
    [index, show, siblings],
  );
  const replay = useCallback(() => {
    const fixture = siblings[index];
    if (fixture) show(fixture, true);
  }, [index, show, siblings]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "r" || event.key === "R") replay();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay, step]);

  if (!shown.view) return <p className="p-6 text-fail">Unknown fixture {id}</p>;
  const button =
    "rounded px-1.5 py-0.5 text-ink-dim hover:bg-raised hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer";
  return (
    <>
      <nav
        data-fixture-nav
        aria-label="Fixture"
        className="fixed bottom-2 left-16 z-50 flex items-center gap-0.5 rounded-md border border-edge bg-surface/85 p-0.5 font-mono text-[11px] leading-none opacity-60 shadow backdrop-blur transition-opacity hover:opacity-100 focus-within:opacity-100"
      >
        <Link href="/dev/ui" className="rounded px-1.5 py-0.5 text-ink-dim hover:text-ink">
          All
        </Link>
        <button
          type="button"
          data-fixture-action="prev"
          aria-label="Previous fixture (Left arrow)"
          title="Previous (Left arrow)"
          className={button}
          disabled={index <= 0}
          onClick={() => step(-1)}
        >
          {"<"}
        </button>
        <span className="px-1 tabular-nums text-ink-dim" title={shown.id}>
          {index + 1}/{siblings.length}
        </span>
        <button
          type="button"
          data-fixture-action="next"
          aria-label="Next fixture (Right arrow)"
          title="Next (Right arrow)"
          className={button}
          disabled={index >= siblings.length - 1}
          onClick={() => step(1)}
        >
          {">"}
        </button>
        <button
          type="button"
          data-fixture-action="replay"
          aria-label="Replay this phase (R)"
          title="Replay (R)"
          className={button}
          onClick={replay}
        >
          replay
        </button>
        <span className="mx-0.5 h-3 w-px bg-edge" aria-hidden="true" />
        {LAYOUTS.map((option) => (
          <Link
            key={option}
            href={`/dev/ui/${shown.id}?layout=${option}`}
            className={`rounded px-1.5 py-0.5 ${option === layout ? "bg-raised text-ink" : "text-ink-dim hover:text-ink"}`}
          >
            {option}
          </Link>
        ))}
      </nav>
      <StaticRoomProvider
        view={shown.view}
        capability="fixture"
        clockOffsetMs={clockOffsetMs}
        // The recap layout is the shareable results page, which is never live.
        live={layout !== "recap"}
        run={logOnly}
      >
        <RoomFrame key={shown.take} layout={layout} enterFirstScene={shown.take > 0} />
      </StaticRoomProvider>
    </>
  );
}
