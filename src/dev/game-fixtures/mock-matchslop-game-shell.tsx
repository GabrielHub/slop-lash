"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { MockEventSource } from "./mock-event-source";
import { MatchSlopGameShell } from "@/games/matchslop/ui/matchslop-game-shell";
import type { GameState } from "@/lib/types";
import { useTheme } from "@/components/theme-provider";
import { getComebackRound, getMockScenario, type MockScenario } from "./scenarios";

interface MockMatchSlopGameShellProps {
  scenario: MockScenario;
  previousSlug?: string;
  nextSlug?: string;
}

function cloneGame(game: GameState): GameState {
  return structuredClone(game);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input, window.location.origin);
  if (input instanceof URL) return input;
  return new URL(input.url, window.location.origin);
}

function withScenarioGame(
  slug: string,
  patch?: (game: GameState) => GameState,
): GameState | null {
  const found = getMockScenario(slug);
  if (!found) return null;
  const next = cloneGame(found.game);
  return patch ? patch(next) : next;
}

function makeMockCode(slug: string): string {
  return `mock-${slug}`;
}

export function MockMatchSlopGameShell({
  scenario,
  previousSlug,
  nextSlug,
}: MockMatchSlopGameShellProps) {
  const [game, setGame] = useState<GameState>(() => cloneGame(scenario.game));
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const mockCode = makeMockCode(scenario.slug);
  const gameRef = useRef(game);
  const stateStreamsRef = useRef(new Set<MockEventSource>());

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useLayoutEffect(() => {
    localStorage.setItem("hostControlToken", "mock-matchslop-host");
    setStorageReady(true);
  }, []);

  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const OriginalEventSource = window.EventSource;
    const stateStreams = stateStreamsRef.current;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = parseUrl(input);
      if (!url.pathname.startsWith(`/api/games/${mockCode}`)) {
        return originalFetch(input as RequestInfo, init);
      }

      const endpoint = url.pathname.replace(`/api/games/${mockCode}`, "");
      const method = (init?.method ?? "GET").toUpperCase();
      await delay(120);

      const log = (label: string) =>
        setActionLog((prev) => [`${new Date().toLocaleTimeString()}: ${label}`, ...prev].slice(0, 8));

      if (method === "POST" && endpoint === "/start") {
        log("start");
        const next = withScenarioGame("matchslop-writing", (fixture) => ({
          ...fixture,
          currentRound: gameRef.current.currentRound,
          totalRounds: gameRef.current.totalRounds,
        }));
        if (next) setGame(next);
        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/next") {
        log(`next (${gameRef.current.status})`);
        const currentGame = gameRef.current;
        const comebackRound = getComebackRound(currentGame);
        const isComebackRound =
          comebackRound != null && currentGame.currentRound === comebackRound;
        let next: GameState | null = null;

        if (currentGame.status === "WRITING") {
          const votingSlug = isComebackRound
            ? "matchslop-comeback-voting"
            : currentGame.currentRound === 1
              ? "matchslop-voting"
              : "matchslop-follow-up-voting";
          next = withScenarioGame(votingSlug, (fixture) => ({
            ...fixture,
            currentRound: currentGame.currentRound,
            totalRounds: currentGame.totalRounds,
            modeState: {
              ...fixture.modeState,
              comebackRound,
            },
          }));
        } else if (currentGame.status === "VOTING") {
          next = withScenarioGame(
            isComebackRound
              ? "matchslop-comeback-results"
              : currentGame.currentRound >= currentGame.totalRounds
                ? "matchslop-results-unmatched"
                : "matchslop-results",
            (fixture) => ({
              ...fixture,
              currentRound: currentGame.currentRound,
              totalRounds: currentGame.totalRounds,
              modeState: {
                ...fixture.modeState,
                comebackRound,
              },
            }),
          );
        } else if (currentGame.status === "ROUND_RESULTS") {
          next = withScenarioGame(
            isComebackRound
              ? "matchslop-final-comeback"
              : currentGame.currentRound >= currentGame.totalRounds
                ? "matchslop-comeback-writing"
                : "matchslop-follow-up-writing",
            (fixture) => ({
              ...fixture,
              currentRound:
                isComebackRound || currentGame.currentRound >= currentGame.totalRounds
                  ? currentGame.currentRound
                  : currentGame.currentRound + 1,
              totalRounds: currentGame.totalRounds,
              modeState: {
                ...fixture.modeState,
                comebackRound:
                  isComebackRound ? comebackRound : currentGame.currentRound + 1,
              },
            }),
          );
        } else if (currentGame.status === "FINAL_RESULTS") {
          next = withScenarioGame("matchslop-final");
        }

        if (next) setGame(next);
        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/end") {
        log("end");
        const next = withScenarioGame("matchslop-final");
        if (next) setGame(next);
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ ok: true, mock: true });
    };

    window.EventSource = class extends MockEventSource {
      constructor(url: string | URL) {
        super(url);

        queueMicrotask(() => {
          if (this.readyState === MockEventSource.CLOSED) return;

          const parsed = new URL(this.url);
          if (parsed.pathname !== `/api/games/${mockCode}/stream`) {
            this.fail();
            return;
          }

          stateStreams.add(this);
          this.setCleanup(() => {
            stateStreams.delete(this);
          });
          this.open();

          const currentGame = gameRef.current;
          this.emit("state", currentGame);
          if (currentGame.status === "FINAL_RESULTS") {
            this.emit("done", {});
            this.close();
          }
        });
      }
    } as typeof EventSource;

    return () => {
      window.fetch = originalFetch;
      window.EventSource = OriginalEventSource;
      for (const stream of stateStreams) {
        stream.close();
      }
      stateStreams.clear();
    };
  }, [mockCode]);

  useEffect(() => {
    for (const stream of stateStreamsRef.current) {
      stream.emit("state", game);
      if (game.status === "FINAL_RESULTS") {
        stream.emit("done", {});
        stream.close();
      }
    }
  }, [game]);

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
                setGame(cloneGame(scenario.game));
                setActionLog([]);
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
        {storageReady ? <MatchSlopGameShell code={mockCode} viewMode="stage" /> : null}
      </div>
    </div>
  );
}
