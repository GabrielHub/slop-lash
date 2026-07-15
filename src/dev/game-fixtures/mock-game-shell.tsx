"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Lobby } from "@/app/game/[code]/lobby";
import { Writing } from "@/app/game/[code]/writing";
import { Voting } from "@/app/game/[code]/voting";
import { Results } from "@/app/game/[code]/results";
import { phaseTransition } from "@/lib/animations";
import { FORFEIT_MARKER } from "@/games/sloplash/scoring";
import type { GameReaction, GameResponse, GameState, PlayerType } from "@/lib/types";
import { useTheme } from "@/components/theme-provider";
import { GameRuntimeProvider, type GameRuntime } from "@/hooks/use-game-runtime";
import { CONVEX_ROOM_SESSION_VERSION } from "@/lib/convex-room-session";
import type { Id } from "../../../convex/_generated/dataModel";
import { getMockScenario, type MockScenario } from "./scenarios";

interface MockGameShellProps {
  scenario: MockScenario;
  previousSlug?: string;
  nextSlug?: string;
}

function cloneGame(game: GameState): GameState {
  return structuredClone(game);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function omitScore(player: GameState["players"][number]): GameResponse["player"] {
  const { score, ...rest } = player;
  void score;
  return rest;
}

function withScenarioGame(slug: string, patch?: (game: GameState) => GameState): GameState | null {
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
  if (type === "AI" || !playerId) return "writing-ai-waiting";
  return "writing-player";
}

function nextVotingFixtureSlug(game: GameState, playerId: string | null): string {
  if (!playerId) return "voting-player";
  const currentPrompt = game.rounds[0]?.prompts[game.votingPromptIndex];
  const isRespondent = !!currentPrompt?.responses.some((r) => r.playerId === playerId);
  return isRespondent ? "voting-respondent" : "voting-player";
}

function countVotablePrompts(game: GameState): number {
  const prompts = game.rounds[0]?.prompts ?? [];
  return prompts.filter(
    (p) => p.responses.length >= 2 && !p.responses.some((r) => r.text === FORFEIT_MARKER),
  ).length;
}

function makeMockCode(slug: string): string {
  return `mock-${slug}`;
}

export function MockGameShell({ scenario, previousSlug, nextSlug }: MockGameShellProps) {
  const [game, setGame] = useState<GameState>(() => cloneGame(scenario.game));
  const [playerId, setPlayerId] = useState<string | null>(scenario.playerId);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const mockCode = makeMockCode(scenario.slug);
  const gameRef = useRef(game);
  gameRef.current = game;

  const commitGame = useCallback((next: GameState | null) => {
    if (!next) return;
    gameRef.current = next;
    setGame(next);
  }, []);

  const updateGame = useCallback((update: (current: GameState) => GameState) => {
    setGame((current) => {
      const next = update(current);
      gameRef.current = next;
      return next;
    });
  }, []);

  const logAction = useCallback((label: string) => {
    setActionLog((current) =>
      [`${new Date().toLocaleTimeString()}: ${label}`, ...current].slice(0, 8),
    );
  }, []);

  const mutations = useMemo<NonNullable<GameRuntime["mutations"]>>(
    () => ({
      lobbyAddAiPlayer: async ({ modelId }) => {
        await delay(180);
        logAction(`add AI (${modelId})`);
        const newPlayerId = `fixture-ai-${Date.now()}`;
        updateGame((current) => {
          const next = cloneGame(current);
          const template = next.players.find((entry) => entry.type === "AI") ?? next.players[0];
          if (!template) return current;
          next.players.push({
            ...template,
            id: newPlayerId,
            modelId,
            name: modelId.split("/").at(-1) ?? "AI Player",
            score: 0,
            type: "AI",
          });
          next.version += 1;
          return next;
        });
        return {
          playerId: newPlayerId as Id<"players">,
          replacedPlayerId: null,
        };
      },
      lobbyKickHuman: async ({ targetPlayerId }) => {
        await delay(180);
        logAction(`kick (${targetPlayerId})`);
        updateGame((current) => {
          const next = cloneGame(current);
          next.players = next.players.filter((entry) => entry.id !== targetPlayerId);
          for (const round of next.rounds) {
            for (const prompt of round.prompts) {
              prompt.assignments = prompt.assignments.filter(
                (assignment) => assignment.playerId !== targetPlayerId,
              );
              prompt.votes = prompt.votes.filter((vote) => vote.voterId !== targetPlayerId);
              prompt.responses = prompt.responses.filter(
                (response) => response.playerId !== targetPlayerId,
              );
            }
          }
          next.version += 1;
          return next;
        });
        return { success: true };
      },
      lobbyRemoveAiPlayer: async ({ targetPlayerId }) => {
        await delay(180);
        logAction(`remove AI (${targetPlayerId})`);
        updateGame((current) => {
          const next = cloneGame(current);
          next.players = next.players.filter((entry) => entry.id !== targetPlayerId);
          next.version += 1;
          return next;
        });
        return { success: true };
      },
      lobbyStart: async () => {
        await delay(180);
        logAction("start");
        const current = gameRef.current;
        const next = withScenarioGame(nextWritingFixtureSlug(current, playerId), (fixture) => ({
          ...fixture,
          currentRound: current.currentRound,
          totalRounds: current.totalRounds,
        }));
        commitGame(next);
        return {
          gameType: "SLOPLASH",
          queuedGenerationJobs: 0,
          roundId: (next?.rounds[0]?.id ?? "fixture-round") as Id<"rounds">,
          started: true,
        };
      },
      reactionsToggle: async ({ emoji, responseId }) => {
        await delay(180);
        const actorId = playerId;
        if (!actorId) throw new Error("A fixture player is required to react");
        logAction(`react (${emoji})`);
        let added = false;
        updateGame((current) => {
          const next = cloneGame(current);
          const target = next.rounds
            .flatMap((round) => round.prompts)
            .flatMap((prompt) => prompt.responses)
            .find((response) => response.id === responseId);
          if (!target) return current;
          const existingIndex = target.reactions.findIndex(
            (reaction) => reaction.playerId === actorId && reaction.emoji === emoji,
          );
          if (existingIndex >= 0) {
            target.reactions.splice(existingIndex, 1);
          } else {
            added = true;
            const reaction: GameReaction = {
              emoji,
              id: `react-${Date.now()}`,
              playerId: actorId,
              responseId,
            };
            target.reactions.push(reaction);
          }
          next.version += 1;
          return next;
        });
        return { added };
      },
      sloplashAdvance: async () => {
        await delay(180);
        const current = gameRef.current;
        logAction(`next (${current.status})`);

        if (current.status === "WRITING") {
          const next = withScenarioGame(nextVotingFixtureSlug(current, playerId), (fixture) => ({
            ...fixture,
            currentRound: current.currentRound,
            totalRounds: current.totalRounds,
          }));
          commitGame(next);
          return { phase: "VOTING" };
        }

        if (current.status === "VOTING") {
          const totalPrompts = countVotablePrompts(current);
          const next = cloneGame(current);
          let phase: "FINAL_RESULTS" | "ROUND_RESULTS" | "VOTING_SUBPHASE" = "VOTING_SUBPHASE";
          if (!next.votingRevealing) {
            next.votingRevealing = true;
          } else if (next.votingPromptIndex < totalPrompts - 1) {
            next.votingPromptIndex += 1;
            next.votingRevealing = false;
          } else {
            const results = withScenarioGame(
              next.currentRound >= next.totalRounds ? "results-final" : "results-round",
              (fixture) => ({
                ...fixture,
                currentRound: next.currentRound,
                totalRounds: next.totalRounds,
              }),
            );
            if (results) {
              phase = next.currentRound >= next.totalRounds ? "FINAL_RESULTS" : "ROUND_RESULTS";
              commitGame(results);
              return { phase };
            }
          }
          next.version += 1;
          commitGame(next);
          return { phase };
        }

        if (current.status === "ROUND_RESULTS") {
          const next = withScenarioGame(nextWritingFixtureSlug(current, playerId), (fixture) => ({
            ...fixture,
            currentRound: current.currentRound + 1,
            totalRounds: current.totalRounds,
          }));
          commitGame(next);
          return { phase: "WRITING" };
        }

        if (current.status === "FINAL_RESULTS") return { phase: "FINAL_RESULTS" };
        throw new Error("Unsupported fixture transition");
      },
      sloplashCastVote: async ({ promptId, responseId }) => {
        await delay(180);
        const voterId = playerId;
        if (!voterId) throw new Error("A fixture player is required to vote");
        const voteId = `vote-${Date.now()}`;
        logAction(`vote (${promptId})`);
        updateGame((current) => {
          const next = cloneGame(current);
          const prompt = next.rounds[0]?.prompts.find((entry) => entry.id === promptId);
          const voter = next.players.find((entry) => entry.id === voterId);
          if (!prompt || !voter || prompt.votes.some((vote) => vote.voterId === voterId)) {
            return current;
          }
          prompt.votes.push({
            failReason: null,
            id: voteId,
            promptId,
            responseId,
            voter: { id: voterId, type: voter.type },
            voterId,
          });
          next.version += 1;
          return next;
        });
        return { phase: null, voteId: voteId as Id<"votes"> };
      },
      sloplashEnd: async () => {
        await delay(180);
        logAction("end game");
        commitGame(withScenarioGame("results-final"));
        return { success: true };
      },
      sloplashSubmitResponse: async ({ promptId, text }) => {
        await delay(180);
        const responderId = playerId;
        if (!responderId || !text.trim()) throw new Error("Invalid fixture response");
        const responseId = `resp-${Date.now()}`;
        logAction(`respond (${promptId})`);
        updateGame((current) => {
          const next = cloneGame(current);
          const prompt = next.rounds[0]?.prompts.find((entry) => entry.id === promptId);
          const player = next.players.find((entry) => entry.id === responderId);
          if (
            !prompt ||
            !player ||
            prompt.responses.some((entry) => entry.playerId === responderId)
          ) {
            return current;
          }
          prompt.responses.push({
            failReason: null,
            id: responseId,
            metadata: null,
            player: omitScore(player),
            playerId: responderId,
            pointsEarned: 0,
            promptId,
            reactions: [],
            text: text.trim(),
          });
          next.version += 1;
          return next;
        });
        return { phase: null, responseId: responseId as Id<"responses"> };
      },
    }),
    [commitGame, logAction, playerId, updateGame],
  );

  const runtime = useMemo<GameRuntime>(() => {
    const player = playerId ? game.players.find((entry) => entry.id === playerId) : null;
    const isFixtureHost = playerId === game.hostPlayerId;
    return {
      gameState: game,
      mutations,
      roomCode: mockCode,
      session: {
        gameId: mockCode,
        gameType: "SLOPLASH",
        hostCapability: isFixtureHost ? "fixture-host-capability" : null,
        playerCapability: playerId ? "fixture-player-capability" : null,
        playerId,
        playerName: player?.name ?? null,
        playerType: player?.type ?? null,
        roomCode: mockCode,
        version: CONVEX_ROOM_SESSION_VERSION,
      },
    };
  }, [game, mockCode, mutations, playerId]);

  const { theme, toggle: toggleTheme } = useTheme();
  const isHost = playerId === game.hostPlayerId;

  const screenKey = useMemo(
    () => `${game.status}:${game.votingPromptIndex}:${game.votingRevealing ? "reveal" : "vote"}`,
    [game.status, game.votingPromptIndex, game.votingRevealing],
  );

  function resetScenario() {
    setGame(cloneGame(scenario.game));
    setPlayerId(scenario.playerId);
    setActionLog([]);
  }

  return (
    <GameRuntimeProvider value={runtime}>
      <div className="flex h-svh flex-col">
        <div className="shrink-0 border-b border-edge bg-base/90 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4 px-4 py-3">
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
                <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
                  {game.status}
                </span>
              </div>
              <h1 className="truncate font-display text-sm font-bold text-ink">{scenario.title}</h1>
              <p className="truncate text-xs text-ink-dim">{scenario.description}</p>
              <p className="mt-1 text-[10px] font-mono text-ink-dim/80">
                local actions: on • viewer: {playerId ?? "none"} • round {game.currentRound}/
                {game.totalRounds}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-xs">
              <button
                type="button"
                onClick={toggleTheme}
                className="cursor-pointer rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              <button
                type="button"
                onClick={resetScenario}
                className="cursor-pointer rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
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

        <div className="min-h-0 flex-1 overflow-auto flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={screenKey}
              className="min-h-full flex flex-col"
              variants={phaseTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {game.status === "LOBBY" && (
                <Lobby game={game} isHost={isHost} code={mockCode} />
              )}
              {game.status === "WRITING" && (
                <Writing game={game} playerId={playerId} code={mockCode} isHost={isHost} />
              )}
              {game.status === "VOTING" && (
                <Voting game={game} playerId={playerId} code={mockCode} isHost={isHost} />
              )}
              {(game.status === "ROUND_RESULTS" || game.status === "FINAL_RESULTS") && (
                <Results
                  game={game}
                  isHost={isHost}
                  code={mockCode}
                  isFinal={game.status === "FINAL_RESULTS"}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </GameRuntimeProvider>
  );
}
