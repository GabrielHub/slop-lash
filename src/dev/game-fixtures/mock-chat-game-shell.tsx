"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChatGameShell } from "@/games/ai-chat-showdown/ui/chat-game-shell";
import type { GameState, GameResponse } from "@/lib/types";
import { useTheme } from "@/components/theme-provider";
import { getMockScenario, type MockScenario } from "./scenarios";

interface MockChatGameShellProps {
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

function makeMockCode(slug: string): string {
  return `mock-${slug}`;
}

interface MockChatMsg {
  id: string;
  playerId: string;
  content: string;
  createdAt: string;
}

function initialChatMessages(game: GameState): MockChatMsg[] {
  if (game.status === "LOBBY") return [];
  const now = Date.now();
  const players = game.players.filter(
    (p) => p.type !== "SPECTATOR" && p.participationStatus === "ACTIVE",
  );
  const msgs: MockChatMsg[] = [];
  const lines = [
    "lol this is gonna be good",
    "bring it on",
    "I've been training for this",
    "prepare to lose",
  ];
  for (const [i, player] of players.slice(0, lines.length).entries()) {
    msgs.push({
      id: `chat-init-${i}`,
      playerId: player.id,
      content: lines[i]!,
      createdAt: new Date(now - (lines.length - i) * 5000).toISOString(),
    });
  }
  return msgs;
}

export function MockChatGameShell({
  scenario,
  previousSlug,
  nextSlug,
}: MockChatGameShellProps) {
  const [game, setGame] = useState<GameState>(() => cloneGame(scenario.game));
  const [playerId] = useState<string | null>(scenario.playerId);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [chatFailMode, setChatFailMode] = useState(false);
  const mockCode = makeMockCode(scenario.slug);

  const chatMsgsRef = useRef<MockChatMsg[]>(initialChatMessages(scenario.game));
  const gameRef = useRef<GameState>(game);
  const chatFailRef = useRef(chatFailMode);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    chatFailRef.current = chatFailMode;
  }, [chatFailMode]);

  useEffect(() => {
    if (!playerId) return;
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;
    localStorage.setItem("playerId", playerId);
    localStorage.setItem("playerName", player.name);
  }, [game.players, playerId]);

  // useLayoutEffect ensures the fetch mock is in place BEFORE any child
  // useEffect (e.g. ChatGameShell's poller) fires. React runs child effects
  // before parent effects, so a regular useEffect would race with the poller
  // and the first poll would hit the real API → 404 → "Game not found".
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = parseUrl(input);

      if (url.pathname === `/api/games/${mockCode}`) {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "GET") {
          await delay(80);
          const ifNoneMatch = init?.headers
            ? (init.headers as Record<string, string>)["If-None-Match"]
            : undefined;
          const currentVersion = gameRef.current.version;
          if (ifNoneMatch === `"${currentVersion}"`) {
            return new Response(null, { status: 304 });
          }
          return jsonResponse(gameRef.current);
        }
      }

      if (url.pathname === `/api/games/${mockCode}/chat`) {
        const method = (init?.method ?? "GET").toUpperCase();
        await delay(chatFailRef.current ? 300 : 120);

        if (method === "GET") {
          const after = url.searchParams.get("after");
          const afterId = url.searchParams.get("afterId");
          let msgs = chatMsgsRef.current;
          if (after) {
            const afterTime = new Date(after).getTime();
            msgs = msgs.filter((m) => {
              const createdAt = new Date(m.createdAt).getTime();
              if (createdAt > afterTime) return true;
              return createdAt === afterTime && !!afterId && m.id > afterId;
            });
          }
          return jsonResponse({ messages: msgs.slice(0, 50) });
        }

        if (method === "POST") {
          const body = await parseJsonBody(init);

          if (chatFailRef.current) {
            return jsonResponse({ error: "Simulated failure" }, 500);
          }

          const content = String(body.content ?? "").trim();
          const senderId = String(body.playerId ?? "");
          if (!content || !senderId) {
            return jsonResponse({ error: "Invalid" }, 400);
          }

          const msg: MockChatMsg = {
            id: `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            playerId: senderId,
            content,
            createdAt: new Date().toISOString(),
          };
          chatMsgsRef.current = [...chatMsgsRef.current, msg];
          return jsonResponse({ id: msg.id, createdAt: msg.createdAt });
        }
      }

      if (url.pathname.startsWith(`/api/games/${mockCode}/`)) {
        const endpoint = url.pathname.replace(`/api/games/${mockCode}`, "");
        const method = (init?.method ?? "GET").toUpperCase();
        const body = await parseJsonBody(init);

        await delay(180);

        const log = (label: string) =>
          setActionLog((prev) =>
            [`${new Date().toLocaleTimeString()}: ${label}`, ...prev].slice(
              0,
              8,
            ),
          );

        if (method === "POST" && endpoint === "/start") {
          log("start");
          const next = withScenarioGame("chat-writing", (fixture) => ({
            ...fixture,
            currentRound: gameRef.current.currentRound,
            totalRounds: gameRef.current.totalRounds,
          }));
          if (next) {
            next.version = gameRef.current.version + 1;
            setGame(next);
          }
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
            const prompt = next.rounds[0]?.prompts.find(
              (p) => p.id === promptId,
            );
            const player = next.players.find((p) => p.id === responderId);
            if (!prompt || !player) return prev;
            if (prompt.responses.some((r) => r.playerId === responderId))
              return next;

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
            body.responseId == null ? null : String(body.responseId);
          if (!promptId || !voterId) {
            return jsonResponse({ error: "Invalid vote payload" }, 400);
          }

          if (responseId === null) {
            return jsonResponse({ error: "Abstains not allowed" }, 400);
          }

          const targetResp = gameRef.current.rounds[0]?.prompts
            .find((p) => p.id === promptId)
            ?.responses.find((r) => r.id === responseId);
          if (targetResp?.playerId === voterId) {
            return jsonResponse({ error: "Cannot vote for yourself" }, 400);
          }

          log(`vote (${promptId})`);
          setGame((prev) => {
            const next = cloneGame(prev);
            const prompt = next.rounds[0]?.prompts.find(
              (p) => p.id === promptId,
            );
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

        if (method === "POST" && endpoint === "/kick") {
          const targetPlayerId = String(body.targetPlayerId ?? "");
          if (!targetPlayerId) {
            return jsonResponse({ error: "Missing targetPlayerId" }, 400);
          }
          log(`kick → disconnect (${targetPlayerId})`);
          setGame((prev) => {
            const next = cloneGame(prev);
            const target = next.players.find((p) => p.id === targetPlayerId);
            if (!target) return prev;
            if (next.status === "LOBBY") {
              next.players = next.players.filter(
                (p) => p.id !== targetPlayerId,
              );
            } else {
              target.participationStatus = "DISCONNECTED";
            }
            next.version += 1;
            return next;
          });
          return jsonResponse({ ok: true });
        }

        if (method === "POST" && endpoint === "/rejoin") {
          log("rejoin");
          setGame((prev) => {
            const next = cloneGame(prev);
            const target = next.players.find(
              (p) => p.participationStatus === "DISCONNECTED",
            );
            if (target) {
              target.participationStatus = "ACTIVE";
              target.lastSeen = new Date().toISOString();
            }
            next.version += 1;
            return next;
          });
          const player = gameRef.current.players.find(
            (p) => p.participationStatus === "DISCONNECTED",
          );
          return jsonResponse({
            playerId: player?.id ?? playerId,
            playerName: player?.name ?? "Player",
            playerType: player?.type ?? "HUMAN",
          });
        }

        if (method === "POST" && endpoint === "/end") {
          log("end game");
          const next = withScenarioGame("chat-results-final");
          if (next) {
            next.version = gameRef.current.version + 1;
            setGame(next);
          }
          return jsonResponse({ ok: true });
        }

        if (method === "POST" && endpoint === "/next") {
          log(`next (${gameRef.current.status})`);

          if (gameRef.current.status === "WRITING") {
            const next = withScenarioGame("chat-voting", (fixture) => ({
              ...fixture,
              currentRound: gameRef.current.currentRound,
              totalRounds: gameRef.current.totalRounds,
            }));
            if (next) {
              next.version = gameRef.current.version + 1;
              setGame(next);
            }
            return jsonResponse({ ok: true });
          }

          if (gameRef.current.status === "VOTING") {
            const slug =
              gameRef.current.currentRound >= gameRef.current.totalRounds
                ? "chat-results-final"
                : "chat-results-round";
            const next = withScenarioGame(slug, (fixture) => ({
              ...fixture,
              currentRound: gameRef.current.currentRound,
              totalRounds: gameRef.current.totalRounds,
            }));
            if (next) {
              next.version = gameRef.current.version + 1;
              setGame(next);
            }
            return jsonResponse({ ok: true });
          }

          if (gameRef.current.status === "ROUND_RESULTS") {
            const nextRound = gameRef.current.currentRound + 1;
            const next = withScenarioGame("chat-writing", (fixture) => ({
              ...fixture,
              currentRound: nextRound,
              totalRounds: gameRef.current.totalRounds,
            }));
            if (next) {
              next.version = gameRef.current.version + 1;
              setGame(next);
            }
            return jsonResponse({ ok: true });
          }

          return jsonResponse({ ok: true });
        }

        if (method === "POST" && endpoint === "/play-again") {
          log("play again");
          return jsonResponse({
            roomCode: "MOCK2",
            hostPlayerId: gameRef.current.hostPlayerId,
          });
        }

        if (method === "POST" && endpoint === "/speech") {
          return jsonResponse({ audio: null });
        }

        if (method === "GET" && endpoint.startsWith("/tagline")) {
          return new Response(null, { status: 204 });
        }

        return jsonResponse({ ok: true, mock: true });
      }

      return originalFetch(input as RequestInfo, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [mockCode, playerId]);

  const { theme, toggle: toggleTheme } = useTheme();

  const disconnectedCount = useMemo(
    () => game.players.filter((p) => p.participationStatus === "DISCONNECTED").length,
    [game.players],
  );

  function resetScenario() {
    setGame(cloneGame(scenario.game));
    chatMsgsRef.current = initialChatMessages(scenario.game);
    setActionLog([]);
    setChatFailMode(false);
  }

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
              <span className="truncate font-mono text-ink-dim">
                {scenario.slug}
              </span>
              <span className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-teal">
                CHATSLOP
              </span>
              <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
                {game.status}
              </span>
            </div>
            <h1 className="truncate font-display text-sm font-bold text-ink">
              {scenario.title}
            </h1>
            <p className="truncate text-xs text-ink-dim">
              {scenario.description}
            </p>
            <p className="mt-0.5 text-[10px] font-mono text-ink-dim/80">
              viewer: {playerId ?? "none"} • round{" "}
              {game.currentRound}/{game.totalRounds}
              {disconnectedCount > 0 && (
                <span className="text-fail ml-1">
                  • {disconnectedCount} disconnected
                </span>
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
  );
}
