"use client";

import { useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, PresenceContext, motion, useIsPresent } from "motion/react";
import { phoneScreen, stageScene } from "@/lib/animations";
import { StaticRoomProvider, useRoom, type RoomContextValue } from "./context";

/**
 * Holds the room as it was while this scene was current. A leaving stage
 * scene keeps drawing its own moment through its 0.18s exit instead of
 * flashing the next phase's content. Works inside any AnimatePresence child
 * (the rail's clock uses it too).
 */
export function FrozenRoom({ children }: { children: ReactNode }) {
  const room = useRoom();
  const present = useIsPresent();
  const [snapshot, setSnapshot] = useState<RoomContextValue>(room);
  // Track the room while present; once leaving, keep the last one seen.
  if (present && snapshot !== room) setSnapshot(room);
  const { view, capability, clockOffsetMs, live, run } = present ? room : snapshot;
  return (
    <StaticRoomProvider
      view={view}
      capability={capability}
      clockOffsetMs={clockOffsetMs}
      live={live}
      run={run}
    >
      {children}
    </StaticRoomProvider>
  );
}

/**
 * Lets entrances play inside a scene that mounted settled. motion hands a
 * presence's `initial={false}` to every motion element under it for as long
 * as that child lives, so in the first scene after a load anything mounted
 * at a later beat (a crown, a burst, a stamp's ring) would skip its entrance
 * too. After the first commit this re-provides the scene's presence with the
 * flag cleared: what mounted with the scene stays settled, what mounts later
 * enters. Exit tracking is untouched (same presence, same callbacks).
 */
function EntrancesAfterMount({ children }: { children: ReactNode }) {
  const presence = useContext(PresenceContext);
  const committed = useRef(false);
  useLayoutEffect(() => {
    committed.current = true;
  }, []);
  // motion reads `initial` once, as each element is created, so a getter lets
  // elements created after the first commit see it cleared without re-rendering
  // every element already in the scene. Reading the ref while children render is
  // the point: it says whether this render is the scene's first.
  const value = useMemo(() => {
    if (presence?.initial !== false) return presence;
    // eslint-disable-next-line react/refs
    return Object.defineProperty({ ...presence }, "initial", {
      enumerable: true,
      get: () => (committed.current ? undefined : false),
    });
  }, [presence]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

/**
 * One screen of the game, keyed by what the room is looking at.
 *
 * - On the stage the old scene leaves in 0.18s, then the new one springs up
 *   and cascades its `sceneItem` children (`stageScene`). The first scene
 *   lands settled (a reload or a late join), unless `enterFirst` asks it to
 *   play its entrance as a phase start would (the fixtures' replay).
 * - On a phone the new screen fades in over 0.16s with no exit and no travel,
 *   so inputs work on the first frame.
 */
export function Scene({
  id,
  surface,
  enterFirst = false,
  children,
}: {
  id: string;
  surface: "stage" | "phone";
  enterFirst?: boolean;
  children: ReactNode;
}) {
  if (surface === "phone") {
    return (
      <motion.div
        key={id}
        className="flex flex-1 flex-col"
        variants={phoneScreen}
        initial="hidden"
        animate="visible"
      >
        {children}
      </motion.div>
    );
  }
  return (
    <AnimatePresence mode="wait" initial={enterFirst}>
      <motion.div
        key={id}
        data-stage-scene=""
        className="relative flex min-h-0 flex-1 flex-col"
        variants={stageScene}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <EntrancesAfterMount>
          <FrozenRoom>{children}</FrozenRoom>
        </EntrancesAfterMount>
      </motion.div>
    </AnimatePresence>
  );
}
