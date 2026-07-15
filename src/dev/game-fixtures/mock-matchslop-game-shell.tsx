"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MockMatchSlopDebugPanel } from "./mock-matchslop-debug-panel";
import {
  advanceMockMatchSlopGame,
  createMockMatchSlopSharedState,
  endMockMatchSlopGame,
  makeMockCode,
  mutateSharedMatchSlopState,
  readSharedMatchSlopState,
  resetSharedMatchSlopState,
  startMockMatchSlopGame,
  subscribeToSharedMatchSlopState,
} from "./mock-matchslop-state";
import {
  MatchSlopGameShell,
  type MatchSlopGameShellFixture,
} from "@/games/matchslop/ui/matchslop-game-shell";
import { useTheme } from "@/components/theme-provider";
import type { MockScenario } from "./scenarios";

interface MockMatchSlopGameShellProps {
  clientLabel?: string;
  scenario: MockScenario;
  previousSlug?: string;
  nextSlug?: string;
}

export function MockMatchSlopGameShell({
  clientLabel = "stage",
  scenario,
  previousSlug,
  nextSlug,
}: MockMatchSlopGameShellProps) {
  const [sharedState, setSharedState] = useState(() =>
    createMockMatchSlopSharedState(scenario.game),
  );
  const game = sharedState.game;
  const actionLog = sharedState.actionLog;
  const mockCode = makeMockCode(scenario.slug);

  useEffect(() => {
    setSharedState(readSharedMatchSlopState(scenario.slug, scenario.game));
    return subscribeToSharedMatchSlopState(scenario.slug, scenario.game, setSharedState);
  }, [scenario.game, scenario.slug]);

  const fixture: MatchSlopGameShellFixture = {
    gameState: game,
    isHost: true,
    start: () => {
      setSharedState(
        mutateSharedMatchSlopState(scenario.slug, scenario.game, "start", startMockMatchSlopGame),
      );
    },
    advance: () => {
      setSharedState(
        mutateSharedMatchSlopState(
          scenario.slug,
          scenario.game,
          `next (${game.status})`,
          advanceMockMatchSlopGame,
        ),
      );
    },
    end: () => {
      setSharedState(
        mutateSharedMatchSlopState(scenario.slug, scenario.game, "end", endMockMatchSlopGame),
      );
    },
    managePersona: () => undefined,
  };

  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="flex h-svh flex-col">
      <div className="shrink-0 border-b border-edge bg-base/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4 px-4 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <Link
                href="/dev/ui"
                className="font-display font-bold text-punch hover:text-punch-hover"
              >
                DEV UI
              </Link>
              <span className="text-edge-strong">/</span>
              <span className="truncate font-mono text-ink-dim">{scenario.slug}</span>
              <span className="rounded-full border border-punch/40 bg-punch/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-punch">
                MATCHSLOP
              </span>
              <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
                {game.status}
              </span>
            </div>
            <h1 className="truncate font-display text-sm font-bold text-ink">{scenario.title}</h1>
            <p className="truncate text-xs text-ink-dim">{scenario.description}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
            <Link
              href={`/dev/ui/${scenario.slug}/controller`}
              className="rounded-md border border-punch/40 bg-punch/10 px-2 py-1 text-punch hover:border-punch hover:bg-punch/15"
            >
              Controller
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="cursor-pointer rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSharedState(resetSharedMatchSlopState(scenario.slug, scenario.game));
              }}
              className="cursor-pointer rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Reset
            </button>
            {previousSlug ? (
              <Link
                href={`/dev/ui/${previousSlug}`}
                className="rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
              >
                Prev
              </Link>
            ) : null}
            {nextSlug ? (
              <Link
                href={`/dev/ui/${nextSlug}`}
                className="rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
        {actionLog.length > 0 && (
          <div className="mx-auto w-full max-w-6xl px-4 pb-1.5">
            <p className="truncate text-[10px] font-mono text-ink-dim/70">
              {actionLog.join("  •  ")}
            </p>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden [&>div]:h-full [&>main]:h-full">
        <MatchSlopGameShell code={mockCode} fixture={fixture} viewMode="stage" />
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] w-full max-w-md px-4">
        <MockMatchSlopDebugPanel
          clientLabel={clientLabel}
          scenarioSlug={scenario.slug}
          sharedState={sharedState}
        />
      </div>
    </div>
  );
}
