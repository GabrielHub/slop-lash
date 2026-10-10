"use client";

import { useLayoutEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAudioUnlock } from "@/components/audio-controls";
import { ThemeToggle } from "@/components/theme-provider";
import { gameUi } from "@/games/ui-registry";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { fade } from "@/lib/animations";
import { useRoom } from "./context";
import { AmbientDriver, HostContinueBar, StageClockCues, YourTurnNudge, phaseKey } from "./cues";
import { PhoneFinishedBar } from "./finished";
import { RoomGate } from "./gate";
import { HostDock } from "./host-dock";
import { ControllerLobby, StageLobby } from "./lobby";
import { MenuButton } from "./menu-sheet";
import { StageFxProvider } from "./moment/stage-fx";
import { SurfaceProvider } from "./moment/surface";
import { CountdownPill, PhoneBar } from "./phone-bar";
import { Scene } from "./scene";
import { StageRail, StageSoundButton, useMuteKey, type StageVariant } from "./stage-rail";
import { TitleCard, TitleCardProvider, useStageTransitions } from "./title-card";

export { phaseKey };

export type RoomLayout = "stage" | "controller" | "game";

/** Sets an attribute on <html> while mounted, so page-level CSS (theme, rem scale) follows the room. */
function useHtmlAttribute(name: string, value: string | null) {
  useLayoutEffect(() => {
    if (value === null) return;
    const root = document.documentElement;
    root.setAttribute(name, value);
    return () => root.removeAttribute(name);
  }, [name, value]);
}

/**
 * The shared screen: the rail, then the current scene (or the lobby) with
 * title cards over it. Owns the room's phase sounds, since only a screen
 * with a stage should make them. On the TV, M mutes.
 */
function StageColumn({
  variant,
  enterFirstScene = false,
}: {
  variant: StageVariant;
  enterFirstScene?: boolean;
}) {
  const { view, live } = useRoom();
  const ui = gameUi(view.room.gameType);
  const lobby = view.room.status === "LOBBY";
  const sceneId = lobby ? "lobby" : (ui.sceneKey?.(view) ?? phaseKey(view));
  const { card, dismiss } = useStageTransitions(sceneId);
  const Effects = live ? ui.StageEffects : undefined;
  const docked = variant === "docked";
  useMuteKey(variant === "stage");

  return (
    <SurfaceProvider value="stage">
      {live && <StageClockCues />}
      {/* The rail fades in as the game leaves the lobby; a reload shows it at once. */}
      <AnimatePresence initial={false}>
        {(!lobby || docked) && (
          <motion.div
            key="rail"
            className="shrink-0"
            variants={fade}
            initial="hidden"
            animate="visible"
          >
            <StageRail
              variant={variant}
              sceneId={sceneId}
              menu={
                docked ? (
                  <MenuButton hostRows={false} className="hidden lg:grid" />
                ) : variant === "recap" ? (
                  <ThemeToggle />
                ) : (
                  <StageSoundButton />
                )
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
      <StageFxProvider>
        {/* Inside the provider, so the game's stage-wide moments can shake and flash. */}
        {Effects && <Effects />}
        <Scene id={sceneId} surface="stage" enterFirst={enterFirstScene}>
          {lobby ? <StageLobby docked={docked} /> : <ui.Stage />}
        </Scene>
        <TitleCard card={card} onDone={dismiss} />
      </StageFxProvider>
    </SurfaceProvider>
  );
}

/** One player's phone screen, or the controller half of the docked view. */
function ControllerColumn({ variant }: { variant: "phone" | "docked" }) {
  const { view, live } = useRoom();
  const ui = gameUi(view.room.gameType);
  const { status } = view.room;
  const lobby = status === "LOBBY";
  const phone = variant === "phone";

  return (
    <SurfaceProvider value="phone">
      {phone && <PhoneBar />}
      <div className="relative flex flex-1 flex-col">
        <Scene id={lobby ? "lobby" : phaseKey(view)} surface="phone">
          {lobby ? <ControllerLobby /> : <ui.Controller />}
        </Scene>
        {status === "FINISHED" && live && <PhoneFinishedBar />}
        {/* Docked, the host dock carries Continue from lg up. */}
        <HostContinueBar className={phone ? "" : "lg:hidden"} />
        {live && <YourTurnNudge fixed={phone} swell={phone} />}
      </div>
    </SurfaceProvider>
  );
}

/**
 * The docked view for a player at a desktop: the stage and their controller
 * side by side on wide screens, "Play" / "Watch" tabs on narrow ones. The
 * countdown is drawn once (the rail's ring, or the tab bar's pill). Host
 * controls sit outside both panes so they survive a tab switch: the dock on
 * wide screens, the tab bar's ⋯ menu on narrow ones.
 */
function GameLayout() {
  const { view } = useRoom();
  const ui = gameUi(view.room.gameType);
  const [tab, setTab] = useState<"play" | "watch">("play");
  const needsInput = ui.needsInput?.(view) ?? false;
  const playing = view.room.status === "PLAYING";

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1 border-b border-edge bg-canvas/95 pl-2 pr-1 lg:hidden">
        <div role="tablist" aria-label="Screen" className="flex h-full flex-1">
          {(["play", "watch"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={tab === option}
              onClick={() => setTab(option)}
              className={`relative flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 self-end text-[15px] font-semibold transition-colors ${
                tab === option ? "border-b-2 border-punch text-ink" : "text-ink-dim hover:text-ink"
              }`}
            >
              {option === "play" ? "Play" : "Watch"}
              {option === "play" && needsInput && (
                <span className="relative flex size-2" aria-label="Your turn">
                  <span className="absolute inset-0 animate-ping rounded-full bg-punch/70" />
                  <span className="relative size-2 rounded-full bg-punch" />
                </span>
              )}
            </button>
          ))}
        </div>
        {playing && <CountdownPill />}
        <MenuButton />
      </div>
      <section
        className={`${tab === "watch" ? "flex" : "hidden"} min-w-0 flex-col border-edge lg:flex lg:border-r`}
      >
        <StageColumn variant="docked" />
      </section>
      <aside
        className={`${tab === "play" ? "flex" : "hidden"} min-w-0 flex-1 flex-col overflow-x-hidden lg:sticky lg:top-0 lg:flex lg:max-h-svh lg:overflow-y-auto`}
      >
        <ControllerColumn variant="docked" />
      </aside>
      <HostDock placement="docked" />
    </div>
  );
}

/**
 * The room frame around a game, for whatever room the surrounding provider
 * holds. `recap` is the read-only stage of a finished game, laid out as a
 * plain web page.
 *
 * A stage-only screen is the TV surface: rem scales with the viewport and a
 * landscape screen becomes a fixed 16:9 artboard (see stage.css). The frame
 * paints no background of its own, so the ambient canvas shows through; the
 * game's theme sits on <html> for as long as the room is open.
 *
 * The first stage scene lands settled; `enterFirstScene` plays its entrance
 * instead, as if its phase had just begun (the dev fixtures' replay).
 */
export function RoomFrame({
  layout,
  enterFirstScene = false,
}: {
  layout: RoomLayout | "recap";
  enterFirstScene?: boolean;
}) {
  const { view, live } = useRoom();
  const ui = gameUi(view.room.gameType);
  const seated = view.me?.playerId != null;
  const recap = layout === "recap";
  // Only a seat has a controller; everyone else watches the stage.
  const effective: RoomLayout = seated && !recap ? layout : "stage";
  const stageSurface = effective === "stage" && !recap;

  useScreenWakeLock(live);
  useAudioUnlock();
  useHtmlAttribute("data-game", ui.theme);
  useHtmlAttribute("data-surface", stageSurface ? "stage" : null);

  return (
    <TitleCardProvider>
      <div
        data-game={ui.theme}
        data-surface={stageSurface ? "stage" : undefined}
        className="flex min-h-svh flex-col"
      >
        <AmbientDriver surface={effective === "controller" ? "phone" : "stage"} />
        {effective === "stage" && (
          <StageColumn variant={recap ? "recap" : "stage"} enterFirstScene={enterFirstScene} />
        )}
        {effective === "controller" && <ControllerColumn variant="phone" />}
        {effective === "game" && <GameLayout />}
        {stageSurface && <HostDock placement="stage" />}
      </div>
    </TitleCardProvider>
  );
}

/** Every live room screen: `/stage`, `/controller`, and `/game`. */
export function RoomScreen({ code, layout }: { code: string; layout: RoomLayout }) {
  return (
    <RoomGate code={code} allowSpectator={layout === "stage"}>
      <RoomFrame layout={layout} />
    </RoomGate>
  );
}
