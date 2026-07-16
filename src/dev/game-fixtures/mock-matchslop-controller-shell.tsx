"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MockMatchSlopDebugPanel } from "./mock-matchslop-debug-panel";
import {
  advanceMockMatchSlopGame,
  createMockMatchSlopSharedState,
  endMockMatchSlopGame,
  makeMockCode,
  mutateSharedMatchSlopState,
  readSharedMatchSlopState,
  recordMockMatchSlopResponse,
  resetSharedMatchSlopState,
  startMockMatchSlopGame,
  subscribeToSharedMatchSlopState,
  voteMockMatchSlopResponse,
} from "./mock-matchslop-state";
import {
  MatchSlopControllerShell,
  type MatchSlopControllerShellFixture,
} from "@/games/matchslop/ui/matchslop-controller-shell";
import type { ControllerGameState } from "@/lib/controller-types";
import type { GameState } from "@/lib/types";
import { useTheme } from "@/components/theme-provider";
import { isActiveCompetitor } from "@/games/core/game-rules";
import type { MockScenario } from "./scenarios";

interface MockMatchSlopControllerShellProps {
  clientLabel?: string;
  scenario: MockScenario;
  previousSlug?: string;
  nextSlug?: string;
}

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
    speaker?: "PERSONA" | "PLAYERS";
    text?: string;
    turn?: number;
  }>;
  latestSignalCategory?: string | null;
  latestSideComment?: string | null;
  latestNextSignal?: string | null;
  latestMoodDelta?: number | null;
  mood?: number;
};

function asMatchSlopModeState(game: GameState): MatchSlopModeState {
  return (game.modeState ?? {}) as MatchSlopModeState;
}

function deriveControllerState(
  game: GameState,
  playerId: string | null,
  hostPlayerId: string | null,
  serverNow: string,
): ControllerGameState {
  const players = game.players.map((player) => ({
    id: player.id,
    name: player.name,
    type: player.type,
    participationStatus: player.participationStatus,
  }));
  const me = playerId ? (players.find((player) => player.id === playerId) ?? null) : null;
  const currentRound = game.rounds[0] ?? null;
  const modeState = asMatchSlopModeState(game);
  const activePlayerIds = new Set(
    game.players.filter(isActiveCompetitor).map((player) => player.id),
  );
  const activeTotal = activePlayerIds.size;
  const profile = modeState.profile ?? null;
  const profilePrompts =
    profile?.prompts?.flatMap((prompt) => {
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
      ? (currentRound.prompts[game.votingPromptIndex] ?? currentRound.prompts[0] ?? null)
      : null;
  const ownVote =
    votingPrompt && playerId
      ? (votingPrompt.votes.find((vote) => vote.voterId === playerId) ?? null)
      : null;

  return {
    id: game.id,
    roomCode: game.roomCode,
    serverNow,
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
                ownVote != null && ownVote.responseId == null && ownVote.failReason == null,
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
      profile:
        profile == null
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
      progressCount:
        game.status === "WRITING" && currentRound
          ? {
              submitted: new Set(
                (currentRound.prompts[0]?.responses ?? [])
                  .map((response) => response.playerId)
                  .filter((currentPlayerId) => activePlayerIds.has(currentPlayerId)),
              ).size,
              total: activeTotal,
            }
          : null,
      voteProgressCount:
        game.status === "VOTING" && currentRound
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

export function MockMatchSlopControllerShell({
  clientLabel = "controller",
  scenario,
  previousSlug,
  nextSlug,
}: MockMatchSlopControllerShellProps) {
  const [sharedState, setSharedState] = useState(() =>
    createMockMatchSlopSharedState(scenario.game),
  );
  const humanPlayers = useMemo(
    () => scenario.game.players.filter((player) => player.type === "HUMAN"),
    [scenario.game.players],
  );
  const hostPlayerId = humanPlayers[0]?.id ?? scenario.playerId ?? null;
  const [viewerPlayerId, setViewerPlayerId] = useState<string | null>(
    scenario.playerId ?? hostPlayerId,
  );
  const game = sharedState.game;
  const actionLog = sharedState.actionLog;
  const mockCode = makeMockCode(scenario.slug);

  useEffect(() => {
    setSharedState(readSharedMatchSlopState(scenario.slug, scenario.game));
    setViewerPlayerId(scenario.playerId ?? hostPlayerId);
    return subscribeToSharedMatchSlopState(scenario.slug, scenario.game, setSharedState);
  }, [hostPlayerId, scenario.game, scenario.playerId, scenario.slug]);

  const fixture: MatchSlopControllerShellFixture = {
    gameState: deriveControllerState(game, viewerPlayerId, hostPlayerId, sharedState.updatedAt),
    isHost: viewerPlayerId != null && viewerPlayerId === hostPlayerId,
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
    submitResponse: (promptId, text, selectedPromptId) => {
      if (!viewerPlayerId) throw new Error("Select a player before responding");
      setSharedState(
        mutateSharedMatchSlopState(
          scenario.slug,
          scenario.game,
          `respond (${promptId})`,
          (currentGame) =>
            recordMockMatchSlopResponse(
              currentGame,
              promptId,
              viewerPlayerId,
              text,
              selectedPromptId,
            ),
        ),
      );
    },
    castVote: (promptId, responseId) => {
      if (!viewerPlayerId) throw new Error("Select a player before voting");
      const result = voteMockMatchSlopResponse(game, promptId, viewerPlayerId, responseId);
      if (result.error) throw new Error(result.error);
      setSharedState(
        mutateSharedMatchSlopState(
          scenario.slug,
          scenario.game,
          `vote (${promptId})`,
          () => result.game,
        ),
      );
    },
  };

  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="min-h-svh">
      <MatchSlopControllerShell
        key={`${mockCode}:${viewerPlayerId ?? "none"}`}
        code={mockCode}
        fixture={fixture}
      />

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
              onChange={(event) => setViewerPlayerId(event.target.value || null)}
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
              setSharedState(resetSharedMatchSlopState(scenario.slug, scenario.game));
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

      <div className="pointer-events-none fixed left-4 top-4 z-[80] w-full max-w-md">
        <MockMatchSlopDebugPanel
          clientLabel={clientLabel}
          scenarioSlug={scenario.slug}
          sharedState={sharedState}
        />
      </div>
    </div>
  );
}
