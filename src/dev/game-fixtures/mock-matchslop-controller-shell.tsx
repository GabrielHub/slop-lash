"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MockEventSource } from "./mock-event-source";
import { MatchSlopControllerShell } from "@/games/matchslop/ui/matchslop-controller-shell";
import type { ControllerGameState } from "@/lib/controller-types";
import type { GameResponse, GameState } from "@/lib/types";
import { useTheme } from "@/components/theme-provider";
import { getComebackRound, getMockScenario, type MockScenario } from "./scenarios";

interface MockMatchSlopControllerShellProps {
  scenario: MockScenario;
  previousSlug?: string;
  nextSlug?: string;
}

type JsonObject = Record<string, unknown>;
type ControllerStreamEntry = {
  playerId: string | null;
  stream: MockEventSource;
};

type MatchSlopModeState = {
  aiVoteWeight?: number;
  comebackRound?: number | null;
  humanVoteWeight?: number;
  outcome?: "IN_PROGRESS" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT" | "COMEBACK";
  personaIdentity?: string | null;
  personaImage?: {
    imageUrl?: string | null;
    status?: "NOT_REQUESTED" | "PENDING" | "READY" | "FAILED";
  } | null;
  profile?: {
    age?: number | null;
    bio?: string | null;
    details?: {
      height?: string | null;
      job?: string | null;
      languages?: string[];
      school?: string | null;
    } | null;
    displayName?: string;
    location?: string | null;
    prompts?: Array<{
      answer?: string | null;
      id?: string;
      prompt?: string;
    }>;
    tagline?: string | null;
  } | null;
  seekerIdentity?: string | null;
  transcript?: Array<{
    authorName?: string | null;
    id?: string;
    outcome?: "CONTINUE" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT" | "COMEBACK" | null;
    speaker?: "PERSONA" | "PLAYERS" | string;
    text?: string;
    turn?: number;
  }>;
  latestSignalCategory?: string | null;
  latestSideComment?: string | null;
  latestNextSignal?: string | null;
  latestMoodDelta?: number | null;
  mood?: number;
};

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

function futureDeadline(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
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

function asMatchSlopModeState(game: GameState): MatchSlopModeState {
  return (game.modeState ?? {}) as MatchSlopModeState;
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

function deriveControllerState(
  game: GameState,
  playerId: string | null,
  hostPlayerId: string | null,
): ControllerGameState {
  const players = game.players.map((player) => ({
    id: player.id,
    name: player.name,
    type: player.type,
    participationStatus: player.participationStatus,
  }));
  const me = playerId ? players.find((player) => player.id === playerId) ?? null : null;
  const currentRound = game.rounds[0] ?? null;
  const modeState = asMatchSlopModeState(game);
  const activePlayerIds = new Set(
    game.players
      .filter((player) => player.type !== "SPECTATOR" && player.participationStatus === "ACTIVE")
      .map((player) => player.id),
  );
  const activeTotal = activePlayerIds.size;
  const profile = modeState.profile ?? null;
  const profilePrompts = profile?.prompts?.flatMap((prompt) => {
    if (!prompt.id || !prompt.prompt || !prompt.answer) return [];
    return [{ id: prompt.id, prompt: prompt.prompt, answer: prompt.answer }];
  }) ?? [];
  const latestAssignedPrompt =
    currentRound?.prompts.find((prompt) =>
      prompt.assignments.some((assignment) => assignment.playerId === playerId),
    ) ??
    currentRound?.prompts[0] ??
    null;
  const latestPlayerResponse =
    latestAssignedPrompt?.responses.find((response) => response.playerId === playerId) ?? null;

  const writingPrompt =
    game.status === "WRITING" && latestAssignedPrompt && playerId && me?.type !== "AI"
      ? {
          promptId: latestAssignedPrompt.id,
          text: latestAssignedPrompt.text,
          submitted: latestPlayerResponse != null,
          openerOptions: game.currentRound === 1 ? profilePrompts : [],
        }
      : null;

  const votingPrompt =
    game.status === "VOTING" && currentRound
      ? currentRound.prompts[game.votingPromptIndex] ?? currentRound.prompts[0] ?? null
      : null;
  const ownVote =
    votingPrompt && playerId
      ? votingPrompt.votes.find((vote) => vote.voterId === playerId) ?? null
      : null;

  return {
    id: game.id,
    roomCode: game.roomCode,
    gameType: game.gameType,
    status: game.status,
    currentRound: game.currentRound,
    totalRounds: game.totalRounds,
    hostPlayerId,
    phaseDeadline: game.phaseDeadline,
    timersDisabled: game.timersDisabled,
    votingPromptIndex: game.votingPromptIndex,
    votingRevealing: game.votingRevealing,
    nextGameCode: game.nextGameCode,
    version: game.version,
    players,
    me,
    writing:
      writingPrompt == null
        ? null
        : {
            prompts: [
              {
                id: writingPrompt.promptId,
                text: writingPrompt.text,
                submitted: writingPrompt.submitted,
              },
            ],
          },
    voting:
      votingPrompt == null
        ? null
        : {
            totalPrompts: 1,
            currentPrompt: {
              id: votingPrompt.id,
              text: votingPrompt.text,
              responses: votingPrompt.responses
                .filter((response) => response.playerId !== playerId)
                .map((response) => ({
                  id: response.id,
                  text: response.text,
                  openerPromptId:
                    typeof response.metadata?.selectedPromptId === "string"
                      ? response.metadata.selectedPromptId
                      : null,
                })),
              isRespondent: false,
              hasVoted: ownVote != null,
              hasAbstained:
                ownVote != null &&
                ownVote.responseId == null &&
                ownVote.failReason == null,
              forfeitCount: 0,
            },
          },
    matchslop: {
      seekerIdentity: modeState.seekerIdentity ?? null,
      personaIdentity: modeState.personaIdentity ?? null,
      outcome: modeState.outcome ?? "IN_PROGRESS",
      humanVoteWeight: modeState.humanVoteWeight ?? 2,
      aiVoteWeight: modeState.aiVoteWeight ?? 1,
      comebackRound: modeState.comebackRound ?? null,
      profile: profile == null
        ? null
        : {
            displayName: profile.displayName ?? "Mystery Match",
            age: profile.age ?? null,
            location: profile.location ?? null,
            bio: profile.bio ?? null,
            tagline: profile.tagline ?? null,
            prompts: profilePrompts,
            details: profile.details
              ? {
                  job: profile.details.job ?? null,
                  school: profile.details.school ?? null,
                  height: profile.details.height ?? null,
                  languages: profile.details.languages ?? [],
                }
              : null,
            image: {
              status: modeState.personaImage?.status ?? "NOT_REQUESTED",
              imageUrl: modeState.personaImage?.imageUrl ?? null,
            },
          },
      transcript:
        modeState.transcript?.flatMap((entry, index) => {
          if (!entry.text) return [];
          return [
            {
              id: entry.id ?? `mock-entry-${index}`,
              speaker: entry.speaker === "PERSONA" ? "PERSONA" : "PLAYERS",
              text: entry.text,
              turn: entry.turn ?? index + 1,
              outcome: entry.outcome ?? null,
              authorName: entry.authorName ?? null,
            },
          ];
        }) ?? [],
      writing: writingPrompt,
      latestSignalCategory: modeState.latestSignalCategory ?? null,
      latestSideComment: modeState.latestSideComment ?? null,
      latestNextSignal: modeState.latestNextSignal ?? null,
      latestMoodDelta: modeState.latestMoodDelta ?? null,
      mood: modeState.mood ?? null,
      progressCount: game.status === "WRITING" && currentRound
        ? {
            submitted: new Set(
              (currentRound.prompts[0]?.responses ?? [])
                .map((response) => response.playerId)
                .filter((currentPlayerId) => activePlayerIds.has(currentPlayerId)),
            ).size,
            total: activeTotal,
          }
        : null,
      voteProgressCount: game.status === "VOTING" && currentRound
        ? {
            voted: new Set(
              (currentRound.prompts[game.votingPromptIndex]?.votes ?? [])
                .map((vote) => vote.voter.id)
                .filter((currentPlayerId) => activePlayerIds.has(currentPlayerId)),
            ).size,
            total: activeTotal,
          }
        : null,
    },
  };
}

function mergeRoundResponses(currentGame: GameState, fixture: GameState) {
  const currentPrompt = currentGame.rounds[0]?.prompts[0];
  const fixturePrompt = fixture.rounds[0]?.prompts[0];
  if (!currentPrompt || !fixturePrompt || currentPrompt.responses.length === 0) {
    return fixture;
  }

  const responseIds = new Set(currentPrompt.responses.map((response) => response.playerId));
  fixturePrompt.responses = [
    ...currentPrompt.responses,
    ...fixturePrompt.responses.filter((response) => !responseIds.has(response.playerId)),
  ];
  return fixture;
}

function syncMockViewer(game: GameState, playerId: string | null, hostPlayerId: string | null) {
  if (playerId) {
    const player = game.players.find((entry) => entry.id === playerId);
    if (player) {
      localStorage.setItem("playerId", playerId);
      localStorage.setItem("playerName", player.name);
      localStorage.setItem("playerType", player.type);
    }
  } else {
    localStorage.removeItem("playerId");
    localStorage.removeItem("playerName");
    localStorage.removeItem("playerType");
  }

  if (playerId != null && playerId === hostPlayerId) {
    localStorage.setItem("hostControlToken", "mock-matchslop-host");
  } else {
    localStorage.removeItem("hostControlToken");
  }
}

export function MockMatchSlopControllerShell({
  scenario,
  previousSlug,
  nextSlug,
}: MockMatchSlopControllerShellProps) {
  const [game, setGame] = useState<GameState>(() => cloneGame(scenario.game));
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const humanPlayers = useMemo(
    () => scenario.game.players.filter((player) => player.type === "HUMAN"),
    [scenario.game.players],
  );
  const hostPlayerId = humanPlayers[0]?.id ?? scenario.playerId ?? null;
  const [viewerPlayerId, setViewerPlayerId] = useState<string | null>(
    scenario.playerId ?? hostPlayerId,
  );
  const mockCode = makeMockCode(scenario.slug);
  const gameRef = useRef(game);
  const controllerStreamsRef = useRef(new Set<ControllerStreamEntry>());

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    setGame(cloneGame(scenario.game));
    setActionLog([]);
    setStorageReady(false);
    setViewerPlayerId(scenario.playerId ?? hostPlayerId);
  }, [scenario, hostPlayerId]);

  useLayoutEffect(() => {
    syncMockViewer(game, viewerPlayerId, hostPlayerId);
    setStorageReady(true);
  }, [game, viewerPlayerId, hostPlayerId]);

  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const OriginalEventSource = window.EventSource;
    const controllerStreams = controllerStreamsRef.current;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = parseUrl(input);
      if (!url.pathname.startsWith(`/api/games/${mockCode}`)) {
        return originalFetch(input as RequestInfo, init);
      }

      const endpoint = url.pathname.replace(`/api/games/${mockCode}`, "");
      const method = (init?.method ?? "GET").toUpperCase();
      const body = await parseJsonBody(init);
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

      if (method === "POST" && endpoint === "/respond") {
        const promptId = String(body.promptId ?? "");
        const responderId = String(body.playerId ?? viewerPlayerId ?? "");
        const text = String(body.text ?? "").trim();
        const selectedPromptId =
          typeof body.metadata === "object" &&
          body.metadata != null &&
          typeof (body.metadata as JsonObject).selectedPromptId === "string"
            ? String((body.metadata as JsonObject).selectedPromptId)
            : null;
        if (!promptId || !responderId || !text) {
          return jsonResponse({ error: "Invalid response payload" }, 400);
        }

        log(`respond (${promptId})`);
        setGame((prev) => {
          const next = cloneGame(prev);
          const prompt = next.rounds[0]?.prompts.find((entry) => entry.id === promptId);
          const player = next.players.find((entry) => entry.id === responderId);
          if (!prompt || !player) return prev;
          if (prompt.responses.some((response) => response.playerId === responderId)) {
            return next;
          }

          prompt.responses.push({
            id: `match-response-${Date.now()}`,
            promptId,
            playerId: responderId,
            metadata: { selectedPromptId },
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
        const voterId = String(body.voterId ?? viewerPlayerId ?? "");
        const responseId =
          body.responseId == null ? null : String(body.responseId);
        if (!promptId || !voterId) {
          return jsonResponse({ error: "Invalid vote payload" }, 400);
        }

        const prompt = gameRef.current.rounds[0]?.prompts.find((entry) => entry.id === promptId);
        const ownResponse = prompt?.responses.find((response) => response.playerId === voterId) ?? null;
        if (ownResponse && ownResponse.id === responseId) {
          return jsonResponse({ error: "Cannot vote for yourself" }, 400);
        }

        log(`vote (${promptId})`);
        setGame((prev) => {
          const next = cloneGame(prev);
          const nextPrompt = next.rounds[0]?.prompts.find((entry) => entry.id === promptId);
          const voter = next.players.find((entry) => entry.id === voterId);
          if (!nextPrompt || !voter) return prev;
          if (nextPrompt.votes.some((vote) => vote.voterId === voterId)) {
            return next;
          }

          nextPrompt.votes.push({
            id: `match-vote-${Date.now()}`,
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

      if (method === "POST" && endpoint === "/next") {
        log(`next (${gameRef.current.status})`);
        const currentGame = gameRef.current;
        const comebackRound = getComebackRound(currentGame);
        const isComebackRound =
          comebackRound != null && currentGame.currentRound === comebackRound;

        if (currentGame.status === "WRITING") {
          const votingSlug = isComebackRound
            ? "matchslop-comeback-voting"
            : currentGame.currentRound === 1
              ? "matchslop-voting"
              : "matchslop-follow-up-voting";
          const next = withScenarioGame(votingSlug, (fixture) =>
            mergeRoundResponses(currentGame, {
              ...fixture,
              currentRound: currentGame.currentRound,
              totalRounds: currentGame.totalRounds,
              modeState: {
                ...fixture.modeState,
                comebackRound,
              },
            }),
          );
          if (next) setGame(next);
          return jsonResponse({ ok: true });
        }

        if (currentGame.status === "VOTING" && !currentGame.votingRevealing) {
          setGame((prev) => ({
            ...cloneGame(prev),
            phaseDeadline: futureDeadline(8),
            version: prev.version + 1,
            votingRevealing: true,
          }));
          return jsonResponse({ ok: true });
        }

        if (currentGame.status === "VOTING") {
          const next = withScenarioGame(
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
          if (next) setGame(next);
          return jsonResponse({ ok: true });
        }

        if (currentGame.status === "ROUND_RESULTS") {
          const next = withScenarioGame(
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
          if (next) setGame(next);
          return jsonResponse({ ok: true });
        }

        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/end") {
        log("end");
        const next = withScenarioGame("matchslop-final");
        if (next) setGame(next);
        return jsonResponse({ ok: true });
      }

      if (method === "POST" && endpoint === "/rejoin") {
        const player =
          gameRef.current.players.find((entry) => entry.id === viewerPlayerId) ??
          gameRef.current.players.find((entry) => entry.id === hostPlayerId) ??
          null;
        return jsonResponse({
          playerId: player?.id ?? null,
          playerName: player?.name ?? "Player",
          playerType: player?.type ?? "HUMAN",
        });
      }

      return jsonResponse({ ok: true, mock: true });
    };

    window.EventSource = class extends MockEventSource {
      constructor(url: string | URL) {
        super(url);

        queueMicrotask(() => {
          if (this.readyState === MockEventSource.CLOSED) return;

          const parsed = new URL(this.url);
          if (parsed.pathname !== `/api/games/${mockCode}/controller/stream`) {
            this.fail();
            return;
          }

          const playerId = parsed.searchParams.get("playerId");
          const entry = { playerId, stream: this };
          controllerStreams.add(entry);
          this.setCleanup(() => {
            controllerStreams.delete(entry);
          });
          this.open();

          const currentGame = gameRef.current;
          this.emit("state", deriveControllerState(currentGame, playerId, hostPlayerId));
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
      for (const entry of controllerStreams) {
        entry.stream.close();
      }
      controllerStreams.clear();
    };
  }, [hostPlayerId, mockCode, viewerPlayerId]);

  useEffect(() => {
    for (const entry of controllerStreamsRef.current) {
      entry.stream.emit("state", deriveControllerState(game, entry.playerId, hostPlayerId));
      if (game.status === "FINAL_RESULTS") {
        entry.stream.emit("done", {});
        entry.stream.close();
      }
    }
  }, [game, hostPlayerId]);

  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="min-h-svh">
      {storageReady ? (
        <MatchSlopControllerShell
          key={`${mockCode}:${viewerPlayerId ?? "none"}`}
          code={mockCode}
        />
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] px-4">
        <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-3xl border border-edge bg-base/90 p-3 shadow-lg backdrop-blur-md">
          <Link
            href="/dev/ui"
            className="rounded-xl border border-edge px-3 py-2 text-xs text-ink-dim hover:border-edge-strong hover:text-ink"
          >
            Dev UI
          </Link>
          <Link
            href={`/dev/ui/${scenario.slug}`}
            className="rounded-xl border border-punch/40 bg-punch/10 px-3 py-2 text-xs text-punch hover:border-punch hover:bg-punch/15"
          >
            Stage
          </Link>
          <label className="flex items-center gap-2 rounded-xl border border-edge px-3 py-2 text-xs text-ink-dim">
            <span>Viewer</span>
            <select
              value={viewerPlayerId ?? ""}
              onChange={(event) => {
                setStorageReady(false);
                setViewerPlayerId(event.target.value || null);
              }}
              className="bg-transparent font-mono text-ink outline-none"
            >
              {humanPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                  {player.id === hostPlayerId ? " (Host)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-xl border border-edge px-3 py-2 text-xs text-ink-dim hover:border-edge-strong hover:text-ink"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            type="button"
            onClick={() => {
              setGame(cloneGame(scenario.game));
              setActionLog([]);
              setStorageReady(false);
            }}
            className="rounded-xl border border-edge px-3 py-2 text-xs text-ink-dim hover:border-edge-strong hover:text-ink"
          >
            Reset
          </button>
          {previousSlug ? (
            <Link
              href={`/dev/ui/${previousSlug}/controller`}
              className="rounded-xl border border-edge px-3 py-2 text-xs text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Prev
            </Link>
          ) : null}
          {nextSlug ? (
            <Link
              href={`/dev/ui/${nextSlug}/controller`}
              className="rounded-xl border border-edge px-3 py-2 text-xs text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Next
            </Link>
          ) : null}
        </div>
        {actionLog.length > 0 && (
          <p className="mx-auto mt-2 max-w-3xl rounded-2xl border border-edge bg-base/85 px-4 py-2 text-[10px] font-mono text-ink-dim/80 shadow-sm backdrop-blur-md">
            {actionLog.join("  •  ")}
          </p>
        )}
      </div>
    </div>
  );
}
