"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Lobby } from "@/app/game/[code]/lobby";
import { Writing } from "@/app/game/[code]/writing";
import { Voting } from "@/app/game/[code]/voting";
import { Results } from "@/app/game/[code]/results";
import { phaseTransition } from "@/lib/animations";
import { FORFEIT_MARKER } from "@/lib/scoring";
import type { GameReaction, GameResponse, GameState, PlayerType } from "@/lib/types";
import { useTheme } from "@/components/theme-provider";
import { getMockScenario, type MockScenario } from "./scenarios";

interface MockGameShellProps {
  scenario: MockScenario;
  previousSlug?: string;
  nextSlug?: string;
}

type JsonObject = Record<string, unknown>;

function cloneGame(game: GameState): GameState {
  return structuredClone(game);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input, window.location.origin);
  if (input instanceof URL) return input;
  return new URL(input.url, window.location.origin);
}

async function parseJsonBody(init?: RequestInit): Promise<JsonObject> {
  if (!init?.body) return {};
  if (typeof init.body === "string") {
    try {
      return JSON.parse(init.body) as JsonObject;
    } catch {
      return {};
    }
  }
  return {};
}

function omitScore(player: GameState["players"][number]): GameResponse["player"] {
  const { score, ...rest } = player;
  void score;
  return rest;
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

function viewerType(game: GameState, playerId: string | null): PlayerType | null {
  if (!playerId) return null;
  return game.players.find((p) => p.id === playerId)?.type ?? null;
}

function nextWritingFixtureSlug(game: GameState, playerId: string | null): string {
  const type = viewerType(game, playerId);
  if (type === "SPECTATOR") return "writing-spectator";
  if (type === "AI" || !playerId) return "writing-ai-waiting";
  return "writing-player";
}

function nextVotingFixtureSlug(game: GameState, playerId: string | null): string {
  const type = viewerType(game, playerId);
  if (type === "SPECTATOR") return "voting-player";
  if (!playerId) return "voting-player";
  const currentPrompt = game.rounds[0]?.prompts[game.votingPromptIndex];
  const isRespondent = !!currentPrompt?.responses.some((r) => r.playerId === playerId);
  return isRespondent ? "voting-respondent" : "voting-player";
}

function countVotablePrompts(game: GameState): number {
  const prompts = game.rounds[0]?.prompts ?? [];
  return prompts.filter(
    (p) =>
      p.responses.length >= 2 &&
      !p.responses.some((r) => r.text === FORFEIT_MARKER),
  ).length;
}

function makeMockCode(slug: string): string {
  return `mock-${slug}`;
}

export function MockGameShell({
  scenario,
  previousSlug,
  nextSlug,
}: MockGameShellProps) {
  const router = useRouter();
  const [game, setGame] = useState<GameState>(() => cloneGame(scenario.game));
  const [playerId, setPlayerId] = useState<string | null>(scenario.playerId);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const mockCode = makeMockCode(scenario.slug);

  useEffect(() => {
    if (!playerId) return;
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;
    localStorage.setItem("playerId", playerId);
    localStorage.setItem("playerName", player.name);
  }, [game.players, playerId]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = parseUrl(input);
      if (!url.pathname.startsWith(`/api/games/${mockCode}`)) {
        return originalFetch(input as RequestInfo, init);
      }

      const endpoint = url.pathname.replace(`/api/games/${mockCode}`, "");
      const method = (init?.method ?? "GET").toUpperCase();
      const body = await parseJsonBody(init);

      await delay(180);

      const log = (label: string) =>
        setActionLog((prev) => [`${new Date().toLocaleTimeString()}: ${label}`, ...prev].slice(0, 8));

      if (method === "POST" && endpoint === "/start") {
        log("start");
        const next = withScenarioGame(nextWritingFixtureSlug(game, playerId), (fixture) => ({
          ...fixture,
          currentRound: game.currentRound,
          totalRounds: game.totalRounds,
        }));
        if (next) setGame(next);
        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/respond") {
        const promptId = String(body.promptId ?? "");
        const text = String(body.text ?? "").trim();
        const responderId = String(body.playerId ?? playerId ?? "");
        if (!promptId || !text || !responderId) {
          return jsonResponse({ error: "Invalid response payload" }, 400);
        }

        log(`respond (${promptId})`);
        setGame((prev) => {
          const next = cloneGame(prev);
          const prompt = next.rounds[0]?.prompts.find((p) => p.id === promptId);
          const player = next.players.find((p) => p.id === responderId);
          if (!prompt || !player) return prev;
          if (prompt.responses.some((r) => r.playerId === responderId)) return next;

          prompt.responses.push({
            id: `resp-${Date.now()}`,
            promptId,
            playerId: responderId,
            text,
            pointsEarned: 0,
            failReason: null,
            reactions: [],
            player: omitScore(player),
          });
          next.version += 1;
          return next;
        });
        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/vote") {
        const promptId = String(body.promptId ?? "");
        const voterId = String(body.voterId ?? playerId ?? "");
        const responseId =
          body.responseId === null || body.responseId == null
            ? null
            : String(body.responseId);
        if (!promptId || !voterId) {
          return jsonResponse({ error: "Invalid vote payload" }, 400);
        }

        log(`vote (${promptId})`);
        setGame((prev) => {
          const next = cloneGame(prev);
          const prompt = next.rounds[0]?.prompts.find((p) => p.id === promptId);
          const voter = next.players.find((p) => p.id === voterId);
          if (!prompt || !voter) return prev;
          if (prompt.votes.some((v) => v.voterId === voterId)) return next;

          prompt.votes.push({
            id: `vote-${Date.now()}`,
            promptId,
            voterId,
            responseId,
            failReason: null,
            voter: { id: voterId, type: voter.type },
          });
          next.version += 1;
          return next;
        });
        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/react") {
        const responseId = String(body.responseId ?? "");
        const actorId = String(body.playerId ?? playerId ?? "");
        const emoji = String(body.emoji ?? "");
        if (!responseId || !actorId || !emoji) {
          return jsonResponse({ error: "Invalid reaction payload" }, 400);
        }

        log(`react (${emoji})`);
        setGame((prev) => {
          const next = cloneGame(prev);
          let target: GameResponse | undefined;
          for (const round of next.rounds) {
            for (const prompt of round.prompts) {
              const found = prompt.responses.find((r) => r.id === responseId);
              if (found) {
                target = found;
                break;
              }
            }
            if (target) break;
          }
          if (!target) return prev;

          const existingIndex = target.reactions.findIndex(
            (r) => r.playerId === actorId && r.emoji === emoji,
          );
          if (existingIndex >= 0) {
            target.reactions.splice(existingIndex, 1);
          } else {
            const newReaction: GameReaction = {
              id: `react-${Date.now()}`,
              responseId,
              playerId: actorId,
              emoji,
            };
            target.reactions.push(newReaction);
          }
          next.version += 1;
          return next;
        });
        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/kick") {
        const targetPlayerId = String(body.targetPlayerId ?? "");
        if (!targetPlayerId) return jsonResponse({ error: "Missing targetPlayerId" }, 400);
        log(`kick (${targetPlayerId})`);
        setGame((prev) => {
          const next = cloneGame(prev);
          next.players = next.players.filter((p) => p.id !== targetPlayerId);
          for (const round of next.rounds) {
            for (const prompt of round.prompts) {
              prompt.assignments = prompt.assignments.filter((a) => a.playerId !== targetPlayerId);
              prompt.votes = prompt.votes.filter((v) => v.voterId !== targetPlayerId);
              prompt.responses = prompt.responses.filter((r) => r.playerId !== targetPlayerId);
            }
          }
          next.version += 1;
          return next;
        });
        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/end") {
        log("end game");
        const next = withScenarioGame("results-final");
        if (next) setGame(next);
        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/next") {
        log(`next (${game.status})`);

        if (game.status === "WRITING") {
          const next = withScenarioGame(nextVotingFixtureSlug(game, playerId), (fixture) => ({
            ...fixture,
            currentRound: game.currentRound,
            totalRounds: game.totalRounds,
          }));
          if (next) setGame(next);
          return jsonResponse({ ok: true });
        }

        if (game.status === "VOTING") {
          const totalPrompts = countVotablePrompts(game);
          setGame((prev) => {
            const next = cloneGame(prev);
            if (!next.votingRevealing) {
              next.votingRevealing = true;
            } else if (next.votingPromptIndex < totalPrompts - 1) {
              next.votingPromptIndex += 1;
              next.votingRevealing = false;
            } else {
              const resultGame = withScenarioGame(
                next.currentRound >= next.totalRounds ? "results-final" : "results-round",
                (fixture) => ({
                  ...fixture,
                  currentRound: next.currentRound,
                  totalRounds: next.totalRounds,
                }),
              );
              return resultGame ?? next;
            }
            next.version += 1;
            return next;
          });
          return jsonResponse({ ok: true });
        }

        if (game.status === "ROUND_RESULTS") {
          const nextRound = game.currentRound + 1;
          const next = withScenarioGame(nextWritingFixtureSlug(game, playerId), (fixture) => ({
            ...fixture,
            currentRound: nextRound,
            totalRounds: game.totalRounds,
          }));
          if (next) setGame(next);
          return jsonResponse({ ok: true });
        }

        if (game.status === "FINAL_RESULTS") {
          return jsonResponse({ ok: true });
        }

        return jsonResponse({ error: "Unsupported next transition" }, 400);
      }

      if (method === "POST" && endpoint === "/play-again") {
        log("play again");
        return jsonResponse({
          roomCode: "MOCK2",
          hostPlayerId: game.hostPlayerId,
        });
      }

      if (method === "POST" && endpoint === "/speech") {
        return jsonResponse({ audio: null });
      }

      if (method === "GET" && endpoint.startsWith("/tagline")) {
        return emptyResponse(204);
      }

      return jsonResponse({ ok: true, mock: true });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [game, mockCode, playerId]);

  const { theme, toggle: toggleTheme } = useTheme();
  const currentPlayer = game.players.find((p) => p.id === playerId);
  const isHost = playerId === game.hostPlayerId;
  const isSpectator = currentPlayer?.type === "SPECTATOR";

  const screenKey = useMemo(
    () => `${game.status}:${game.votingPromptIndex}:${game.votingRevealing ? "reveal" : "vote"}`,
    [game.status, game.votingPromptIndex, game.votingRevealing],
  );

  function resetScenario() {
    setGame(cloneGame(scenario.game));
    setPlayerId(scenario.playerId);
    setActionLog([]);
  }

  function handlePlayAgainCreated() {
    const next = withScenarioGame("lobby-host-ready");
    if (!next) return;
    setGame(next);
    setPlayerId(next.hostPlayerId);
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-40 border-b border-edge bg-base/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <Link href="/dev/ui" className="font-display font-bold text-punch hover:text-punch-hover">
                DEV UI
              </Link>
              <span className="text-edge-strong">/</span>
              <span className="truncate font-mono text-ink-dim">{scenario.slug}</span>
              <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
                {game.status}
              </span>
            </div>
            <h1 className="truncate font-display text-sm font-bold text-ink">{scenario.title}</h1>
            <p className="truncate text-xs text-ink-dim">{scenario.description}</p>
            <p className="mt-1 text-[10px] font-mono text-ink-dim/80">
              local actions: on • viewer: {playerId ?? "none"} • round {game.currentRound}/{game.totalRounds}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={resetScenario}
              className="rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Reset
            </button>
            <Link
              href="/dev/components"
              className="rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Components
            </Link>
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
          <div className="mx-auto w-full max-w-6xl px-4 pb-2">
            <p className="truncate text-[10px] font-mono text-ink-dim/70">
              {actionLog.join("  •  ")}
            </p>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={screenKey}
          variants={phaseTransition}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="pt-16"
        >
          {game.status === "LOBBY" && (
            <Lobby game={game} isHost={isHost} code={mockCode} onRefresh={() => {}} />
          )}
          {game.status === "WRITING" && (
            <Writing
              game={game}
              playerId={playerId}
              code={mockCode}
              isHost={isHost}
              isSpectator={isSpectator}
            />
          )}
          {game.status === "VOTING" && (
            <Voting
              game={game}
              playerId={playerId}
              code={mockCode}
              isHost={isHost}
              isSpectator={isSpectator}
            />
          )}
          {(game.status === "ROUND_RESULTS" || game.status === "FINAL_RESULTS") && (
            <Results
              game={game}
              isHost={isHost}
              playerId={playerId}
              code={mockCode}
              isFinal={game.status === "FINAL_RESULTS"}
              onPlayAgainCreated={() => {
                handlePlayAgainCreated();
                router.push("/dev/ui/lobby-host-ready");
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
