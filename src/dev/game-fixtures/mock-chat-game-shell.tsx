"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChatGameShell } from "@/games/ai-chat-showdown/ui/chat-game-shell";
import type { GameState, GameResponse } from "@/lib/types";
import { useTheme } from "@/components/theme-provider";
import {
  GameRuntimeProvider,
  type GameRuntime,
  type GameRuntimeChatMessage,
} from "@/hooks/use-game-runtime";
import { CONVEX_ROOM_SESSION_VERSION } from "@/lib/convex-room-session";
import type { Id } from "../../../convex/_generated/dataModel";
import { getMockScenario, type MockScenario } from "./scenarios";

interface MockChatGameShellProps {
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

function makeMockCode(slug: string): string {
  return `mock-${slug}`;
}

function initialChatMessages(game: GameState): GameRuntimeChatMessage[] {
  if (game.status === "LOBBY") return [];
  const now = Date.now();
  const players = game.players.filter(
    (p) => p.type !== "SPECTATOR" && p.participationStatus === "ACTIVE",
  );
  const msgs: GameRuntimeChatMessage[] = [];
  const lines = [
    "lol this is gonna be good",
    "bring it on",
    "I've been training for this",
    "prepare to lose",
  ];
  for (const [i, player] of players.slice(0, lines.length).entries()) {
    msgs.push({
      clientId: null,
      id: `chat-init-${i}`,
      playerId: player.id,
      content: lines[i]!,
      createdAt: new Date(now - (lines.length - i) * 5000).toISOString(),
      replyToId: null,
    });
  }
  return msgs;
}

export function MockChatGameShell({ scenario, previousSlug, nextSlug }: MockChatGameShellProps) {
  const [game, setGame] = useState<GameState>(() => cloneGame(scenario.game));
  const [playerId] = useState<string | null>(scenario.playerId);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [chatFailMode, setChatFailMode] = useState(false);
  const mockCode = makeMockCode(scenario.slug);

  const [chatMessages, setChatMessages] = useState<GameRuntimeChatMessage[]>(() =>
    initialChatMessages(scenario.game),
  );
  const gameRef = useRef<GameState>(game);
  const chatFailRef = useRef(chatFailMode);
  gameRef.current = game;
  chatFailRef.current = chatFailMode;

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
      chatSend: async ({ clientId, content }) => {
        await delay(chatFailRef.current ? 300 : 120);
        if (chatFailRef.current) throw new Error("Simulated chat failure");
        if (!playerId || !content.trim()) throw new Error("Invalid fixture chat message");
        const message = {
          clientId: clientId ?? null,
          content: content.trim(),
          createdAt: new Date().toISOString(),
          id: `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          playerId,
          replyToId: null,
        };
        setChatMessages((current) => [...current, message]);
        return {
          ...message,
          id: message.id as Id<"chatMessages">,
          playerId: message.playerId as Id<"players">,
        };
      },
      chatslopAdvance: async () => {
        await delay(180);
        const current = gameRef.current;
        logAction(`next (${current.status})`);
        if (current.status === "WRITING") {
          const next = withScenarioGame("chat-voting", (fixture) => ({
            ...fixture,
            currentRound: current.currentRound,
            totalRounds: current.totalRounds,
            version: current.version + 1,
          }));
          commitGame(next);
          return { phase: "VOTING" };
        }
        if (current.status === "VOTING") {
          const slug =
            current.currentRound >= current.totalRounds
              ? "chat-results-final"
              : "chat-results-round";
          const next = withScenarioGame(slug, (fixture) => ({
            ...fixture,
            currentRound: current.currentRound,
            totalRounds: current.totalRounds,
            version: current.version + 1,
          }));
          commitGame(next);
          return { phase: next?.status === "FINAL_RESULTS" ? "FINAL_RESULTS" : "ROUND_RESULTS" };
        }
        if (current.status === "ROUND_RESULTS") {
          const next = withScenarioGame("chat-writing", (fixture) => ({
            ...fixture,
            currentRound: current.currentRound + 1,
            totalRounds: current.totalRounds,
            version: current.version + 1,
          }));
          commitGame(next);
          return { phase: "WRITING" };
        }
        if (current.status === "FINAL_RESULTS") return { phase: "FINAL_RESULTS" };
        throw new Error("Unsupported fixture transition");
      },
      chatslopEnd: async () => {
        await delay(180);
        logAction("end game");
        const next = withScenarioGame("chat-results-final", (fixture) => ({
          ...fixture,
          version: gameRef.current.version + 1,
        }));
        commitGame(next);
        return { success: true };
      },
      chatslopRespond: async ({ promptId, text }) => {
        await delay(180);
        if (!playerId || !text.trim()) throw new Error("Invalid fixture response");
        const responseId = `response-${Date.now()}`;
        logAction(`respond (${promptId})`);
        updateGame((current) => {
          const next = cloneGame(current);
          const prompt = next.rounds[0]?.prompts.find((entry) => entry.id === promptId);
          const player = next.players.find((entry) => entry.id === playerId);
          if (!prompt || !player || prompt.responses.some((entry) => entry.playerId === playerId)) {
            return current;
          }
          prompt.responses.push({
            failReason: null,
            id: responseId,
            metadata: null,
            player: omitScore(player),
            playerId,
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
      chatslopVote: async ({ promptId, responseId }) => {
        await delay(180);
        if (!playerId) throw new Error("A fixture player is required to vote");
        const currentPrompt = gameRef.current.rounds[0]?.prompts.find(
          (entry) => entry.id === promptId,
        );
        if (
          currentPrompt?.responses.find((entry) => entry.id === responseId)?.playerId === playerId
        ) {
          throw new Error("Cannot vote for yourself");
        }
        const voteId = `vote-${Date.now()}`;
        logAction(`vote (${promptId})`);
        updateGame((current) => {
          const next = cloneGame(current);
          const prompt = next.rounds[0]?.prompts.find((entry) => entry.id === promptId);
          const voter = next.players.find((entry) => entry.id === playerId);
          if (!prompt || !voter || prompt.votes.some((entry) => entry.voterId === playerId)) {
            return current;
          }
          prompt.votes.push({
            failReason: null,
            id: voteId,
            promptId,
            responseId,
            voter: { id: playerId, type: voter.type },
            voterId: playerId,
          });
          next.version += 1;
          return next;
        });
        return { phase: null, voteId: voteId as Id<"votes"> };
      },
      lobbyKickHuman: async ({ targetPlayerId }) => {
        await delay(180);
        logAction(`kick → disconnect (${targetPlayerId})`);
        updateGame((current) => {
          const next = cloneGame(current);
          const target = next.players.find((entry) => entry.id === targetPlayerId);
          if (!target) return current;
          if (next.status === "LOBBY") {
            next.players = next.players.filter((entry) => entry.id !== targetPlayerId);
          } else {
            target.participationStatus = "DISCONNECTED";
          }
          next.version += 1;
          return next;
        });
        return { success: true };
      },
      lobbyStart: async () => {
        await delay(180);
        const current = gameRef.current;
        logAction("start");
        const next = withScenarioGame("chat-writing", (fixture) => ({
          ...fixture,
          currentRound: current.currentRound,
          totalRounds: current.totalRounds,
          version: current.version + 1,
        }));
        commitGame(next);
        return {
          gameType: "AI_CHAT_SHOWDOWN",
          queuedGenerationJobs: 0,
          roundId: (next?.rounds[0]?.id ?? "fixture-round") as Id<"rounds">,
          started: true,
        };
      },
    }),
    [commitGame, logAction, playerId, updateGame],
  );

  const runtime = useMemo<GameRuntime>(() => {
    const player = playerId ? game.players.find((entry) => entry.id === playerId) : null;
    return {
      chat: { messages: chatMessages },
      gameState: game,
      mutations,
      roomCode: mockCode,
      session: {
        gameId: mockCode,
        gameType: "AI_CHAT_SHOWDOWN",
        hostCapability: playerId === game.hostPlayerId ? "fixture-host-capability" : null,
        playerCapability: playerId ? "fixture-player-capability" : null,
        playerId,
        playerName: player?.name ?? null,
        playerType: player?.type ?? null,
        roomCode: mockCode,
        version: CONVEX_ROOM_SESSION_VERSION,
      },
    };
  }, [chatMessages, game, mockCode, mutations, playerId]);

  const { theme, toggle: toggleTheme } = useTheme();

  const disconnectedCount = useMemo(
    () => game.players.filter((p) => p.participationStatus === "DISCONNECTED").length,
    [game.players],
  );

  function resetScenario() {
    commitGame(cloneGame(scenario.game));
    setChatMessages(initialChatMessages(scenario.game));
    setActionLog([]);
    setChatFailMode(false);
  }

  return (
    <GameRuntimeProvider value={runtime}>
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
                <span className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-teal">
                  CHATSLOP
                </span>
                <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
                  {game.status}
                </span>
              </div>
              <h1 className="truncate font-display text-sm font-bold text-ink">{scenario.title}</h1>
              <p className="truncate text-xs text-ink-dim">{scenario.description}</p>
              <p className="mt-0.5 text-[10px] font-mono text-ink-dim/80">
                viewer: {playerId ?? "none"} • round {game.currentRound}/{game.totalRounds}
                {disconnectedCount > 0 && (
                  <span className="text-fail ml-1">• {disconnectedCount} disconnected</span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setChatFailMode(!chatFailMode)}
                className={`cursor-pointer rounded-md border px-2 py-1 transition-colors ${
                  chatFailMode
                    ? "border-fail/40 bg-fail-soft/30 text-fail"
                    : "border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
                }`}
              >
                {chatFailMode ? "Fail: ON" : "Fail: OFF"}
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="cursor-pointer rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
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
            <div className="mx-auto w-full max-w-6xl px-4 pb-1.5">
              <p className="truncate text-[10px] font-mono text-ink-dim/70">
                {actionLog.join("  •  ")}
              </p>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden [&>div]:h-full [&>main]:h-full">
          <ChatGameShell code={mockCode} />
        </div>
      </div>
    </GameRuntimeProvider>
  );
}
