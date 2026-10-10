"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { gameUi } from "@/games/ui-registry";
import { pulseAmbient } from "@/lib/ambient-events";
import { DUR, EASE, SPRING, fade, wipe } from "@/lib/animations";
import { playSound, type SoundName } from "@/lib/sounds";
import { useRoom } from "./context";
import type { TitleCardSpec } from "./game-ui";
import { isFreshPhase } from "./moment/use-fresh";
import { useReducedAfterMount } from "./moment/use-reduced";

/** The wipe in; the card then holds for `spec.hold` (or `DUR.hold`) and wipes out. */
const WIPE_IN_S = 0.32;
/** The opening card is short: the room has stared at the lobby long enough. */
const GAME_START_HOLD_S = 0.8;

const TONE: Record<TitleCardSpec["tone"], string> = {
  punch: "bg-punch",
  teal: "bg-teal",
  gold: "bg-gold",
};

const CardShowing = createContext<{ showing: boolean; set: (showing: boolean) => void }>({
  showing: false,
  set: () => {},
});

/** Lets the room frame know when a title card covers the stage (the host's Continue waits for it). */
export function TitleCardProvider({ children }: { children: ReactNode }) {
  const [showing, set] = useState(false);
  return <CardShowing.Provider value={{ showing, set }}>{children}</CardShowing.Provider>;
}

/** True while a title card is on the stage. */
export function useTitleCardShowing() {
  return useContext(CardShowing).showing;
}

/**
 * Runs once per live stage change: picks the title card to show (on LOBBY ->
 * PLAYING the game's own card if it has one, else a short "Round 1" opener,
 * which a game that owns its lobby goes without; otherwise `ui.titleCard`), pulses the background, and plays the one phase
 * cue for the room. A step inside the same phase (the next question of a
 * reveal) stays quiet; per-step cues belong to the game. A recap, a reload or a
 * late open shows no card and plays nothing.
 *
 * "Play again" swaps the room for a new game under the same code: the cards
 * already seen are forgotten (game 2 has its own rounds) and a "Game 2" card
 * opens the new lobby with a cheer.
 */
export function useStageTransitions(sceneId: string) {
  const { view, live, clockOffsetMs } = useRoom();
  const ui = gameUi(view.room.gameType);
  const spec = ui.titleCard?.(view) ?? null;
  const { status, round, phase, id: roomId, gameNumber } = view.room;
  const [card, setCard] = useState<TitleCardSpec | null>(null);
  const previous = useRef<{
    scene: string;
    status: string;
    round: number;
    phase: string;
    roomId: string;
  } | null>(null);
  const seen = useRef(new Set<string>());
  const report = useContext(CardShowing).set;

  useEffect(() => {
    report(card !== null);
  }, [card, report]);
  useEffect(() => () => report(false), [report]);

  // Reads the latest view, but runs only when the scene, phase or card changes.
  const onTransition = useEffectEvent(() => {
    const before = previous.current;
    previous.current = { scene: sceneId, status, round, phase, roomId };
    const current = spec;
    if (!before || !live) {
      if (current) seen.current.add(current.id);
      return;
    }

    let next: TitleCardSpec | null = null;
    let sound: SoundName | null = null;
    const fresh = isFreshPhase(view.room.phaseStartedAt, clockOffsetMs);
    const rematch = before.roomId !== roomId;
    if (rematch) seen.current.clear();
    if (rematch && status === "LOBBY") {
      if (fresh) {
        next = {
          id: `rematch:${roomId}`,
          kicker: "Play again",
          title: `Game ${gameNumber}`,
          tone: "punch",
        };
        sound = "round-transition";
        pulseAmbient({ kind: "cheer" });
      }
    } else if (before.status === "LOBBY" && status === "PLAYING") {
      // The lobby showed the game's name for minutes; open on something new.
      // A game that draws its own lobby opens in its own scene, without the shell's card.
      const { totalRounds } = view.room;
      next = ui.ownsLobby
        ? current
        : (current ?? {
            id: "game-start",
            kicker: totalRounds > 1 ? `${ui.name} · ${totalRounds} rounds` : ui.name,
            title: totalRounds > 1 ? "Round 1" : "Here we go",
            tone: "punch",
            hold: GAME_START_HOLD_S,
          });
      sound = "game-start";
    } else if (current && !seen.current.has(current.id) && fresh) {
      next = current;
      sound = "round-transition";
    }
    if (current) seen.current.add(current.id);

    const sceneChanged = before.scene !== sceneId;
    const phaseChanged =
      before.status !== status || before.round !== round || before.phase !== phase;
    if (sceneChanged) pulseAmbient({ kind: "swell" });
    if (
      !sound &&
      sceneChanged &&
      phaseChanged &&
      status === "PLAYING" &&
      !ui.playsOwnPhaseCue?.(view)
    ) {
      sound = round !== before.round ? "round-transition" : "phase-transition";
    }
    if (sound) playSound(sound);
    if (next) setCard(next);
  });
  const specId = spec?.id ?? null;
  useEffect(() => onTransition(), [sceneId, status, round, phase, specId, roomId, gameNumber]);

  const dismiss = useCallback(() => setCard(null), []);
  return { card, dismiss };
}

/**
 * A stage-only interstitial ("ROUND 2 · ×2 points"): a band in the game's
 * colour wipes across, holds about a second, then wipes off to the right; the
 * scrim lifts only once the band is gone, so one thing moves at a time. Drawn
 * inside the stage column, never `fixed`, so phones and the docked view never
 * wait for it. The title sizes to the stage column, not the page.
 */
export function TitleCard({ card, onDone }: { card: TitleCardSpec | null; onDone: () => void }) {
  const reduced = useReducedAfterMount();
  const cardId = card?.id;
  const holdMs = (WIPE_IN_S + (card?.hold ?? DUR.hold)) * 1_000;
  useEffect(() => {
    if (!cardId) return;
    const timer = window.setTimeout(onDone, holdMs);
    return () => window.clearTimeout(timer);
  }, [cardId, holdMs, onDone]);

  const band: Variants = reduced ? fade : wipe;
  const words: Variants = reduced
    ? fade
    : {
        hidden: { opacity: 0, x: "-6%" },
        visible: { opacity: 1, x: 0, transition: { ...SPRING.gentle, delay: 0.08 } },
      };

  return (
    <>
      <output aria-live="polite" className="sr-only">
        {card ? [card.kicker, card.title].filter(Boolean).join(". ") : ""}
      </output>
      <AnimatePresence>
        {card && (
          <motion.div
            key={card.id}
            aria-hidden="true"
            className="@container absolute inset-0 z-40 flex items-center overflow-hidden bg-canvas/90"
            initial={{ opacity: reduced ? 0 : 1 }}
            animate={{ opacity: 1, transition: { duration: reduced ? 0.15 : 0 } }}
            exit={{
              opacity: 0,
              transition: reduced
                ? { duration: 0.15 }
                : { delay: 0.2, duration: 0.15, ease: EASE.in },
            }}
          >
            <motion.div
              className={`w-full py-[2.25rem] text-accent-ink ${TONE[card.tone]}`}
              variants={band}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div
                className="mx-auto flex max-w-[72rem] flex-col items-center px-[2rem] text-center"
                variants={words}
                initial="hidden"
                animate="visible"
              >
                {card.kicker && (
                  <p className="mb-[0.5rem] font-mono text-[clamp(0.875rem,3cqw,1.5rem)] font-bold uppercase tracking-[0.3em] opacity-80">
                    {card.kicker}
                  </p>
                )}
                <p className="font-display text-[clamp(2.5rem,12cqw,7.5rem)] font-extrabold leading-[0.95] tracking-tight">
                  {card.title}
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
