"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useConvexRoomPresence } from "@/hooks/use-convex-room-presence";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import type { ControllerGameState } from "@/lib/controller-types";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { createOpenerPromptMap, findSelectedPromptOption } from "./matchslop-controller-components";
import type { MatchSlopControllerShellFixture } from "./matchslop-controller-fixture";

export function useMatchSlopController(
  code: string,
  fixture: MatchSlopControllerShellFixture | undefined,
) {
  const roomSession = useConvexRoomSession(code);
  const playerCapability = roomSession?.playerCapability ?? null;
  const hostCapability = roomSession?.hostCapability ?? null;
  const capability = playerCapability ?? hostCapability;
  useConvexRoomPresence({ capability: fixture ? null : capability });

  const queriedGameState = useQuery(
    api.gameViews.controller,
    fixture ? "skip" : capability ? { capability } : "skip",
  ) as ControllerGameState | undefined;
  const gameState = fixture?.gameState ?? queriedGameState;
  const startGameMutation = useMutation(api.lobby.start);
  const advanceGameMutation = useMutation(api.matchslop.advance);
  const endGameMutation = useMutation(api.matchslop.end);
  const managePersonaMutation = useMutation(api.matchslop.managePersona);
  const submitResponseMutation = useMutation(api.matchslop.submitResponse);
  const castVoteMutation = useMutation(api.matchslop.castVote);
  useScreenWakeLock(gameState != null);

  useEffect(() => {
    document.documentElement.setAttribute("data-game", "matchslop");
    return () => document.documentElement.removeAttribute("data-game");
  }, []);

  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [openerStep, setOpenerStep] = useState<"pick" | "write">("pick");
  const [responseText, setResponseText] = useState("");
  const [submittedPromptIds, setSubmittedPromptIds] = useState<Set<string>>(new Set());
  const [submittingPromptId, setSubmittingPromptId] = useState<string | null>(null);
  const [votingPromptIds, setVotingPromptIds] = useState<Set<string>>(new Set());
  const [votingBusy, setVotingBusy] = useState(false);
  const [hostActionBusy, setHostActionBusy] = useState(false);
  const [personaAction, setPersonaAction] = useState<"generate" | "skip" | null>(null);
  const [endingGame, setEndingGame] = useState(false);
  const [showPersonaSheet, setShowPersonaSheet] = useState(false);
  const [actionError, setActionError] = useState("");
  const phaseKeyRef = useRef("");

  useEffect(() => {
    if (!gameState) return;
    const nextKey = `${gameState.status}:${gameState.currentRound}:${gameState.votingPromptIndex}:${gameState.votingRevealing ? 1 : 0}`;
    if (phaseKeyRef.current === nextKey) return;

    phaseKeyRef.current = nextKey;
    setActionError("");
    setShowPersonaSheet(false);
    if (gameState.status !== "WRITING") {
      setResponseText("");
      setSubmittedPromptIds(new Set());
      setSelectedPromptId(null);
      setOpenerStep("pick");
    }
    if (gameState.status !== "VOTING") setVotingPromptIds(new Set());
  }, [gameState]);

  useEffect(() => {
    if (!showPersonaSheet) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPersonaSheet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [showPersonaSheet]);

  const isHost = fixture?.isHost ?? hostCapability !== null;
  const activePlayerCount =
    gameState?.players.filter((player) => player.type !== "SPECTATOR").length ?? 0;
  const matchslop = gameState?.matchslop ?? null;
  const profileGeneration = matchslop?.profileGeneration ?? null;
  const promptOptions = matchslop?.writing?.openerOptions ?? [];
  const openerPromptById = createOpenerPromptMap(matchslop?.profile?.prompts);
  const currentVotePrompt = gameState?.voting?.currentPrompt ?? null;
  const hasVotedCurrent = currentVotePrompt
    ? currentVotePrompt.hasVoted || votingPromptIds.has(currentVotePrompt.id)
    : false;
  const hasSubmittedCurrent =
    matchslop?.writing?.submitted ||
    (matchslop?.writing?.promptId ? submittedPromptIds.has(matchslop.writing.promptId) : false);
  const comebackRound = matchslop?.comebackRound ?? null;
  const isComebackRound = comebackRound != null && gameState?.currentRound === comebackRound;
  const isOpenerRound = gameState?.currentRound === 1;
  const isInitialProfilePending =
    gameState?.status === "WRITING" &&
    gameState.currentRound === 1 &&
    matchslop?.profile == null &&
    profileGeneration?.status !== "FAILED";
  const isInitialProfileFailed =
    gameState?.status === "WRITING" &&
    gameState.currentRound === 1 &&
    matchslop?.profile == null &&
    profileGeneration?.status === "FAILED";
  const isOpenerVoting =
    currentVotePrompt?.responses.some((response) => response.openerPromptId) ?? false;
  const selectedOption = findSelectedPromptOption(promptOptions, selectedPromptId);
  const personaName = matchslop?.profile?.displayName ?? "the persona";
  const canEndGame =
    isHost &&
    (gameState?.status === "WRITING" ||
      gameState?.status === "VOTING" ||
      gameState?.status === "ROUND_RESULTS");
  const showPersonaButton =
    gameState != null && gameState.status !== "LOBBY" && matchslop?.profile != null;
  const gameStarted = gameState != null && gameState.status !== "LOBBY";

  async function postHostAction(path: "start" | "next") {
    if (!fixture && !hostCapability) return;
    setHostActionBusy(true);
    setActionError("");
    try {
      if (fixture) {
        await (path === "start" ? fixture.start() : fixture.advance());
      } else if (hostCapability) {
        await (path === "start"
          ? startGameMutation({ capability: hostCapability })
          : advanceGameMutation({ capability: hostCapability }));
      }
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Action failed"));
    } finally {
      setHostActionBusy(false);
    }
  }

  async function postPersonaAction(action: "generate" | "skip") {
    if (!fixture && !hostCapability) return;
    setPersonaAction(action);
    setActionError("");
    try {
      if (fixture) await fixture.managePersona(action);
      else if (hostCapability) await managePersonaMutation({ capability: hostCapability, action });
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Persona action failed"));
    } finally {
      setPersonaAction(null);
    }
  }

  async function handleEndGame() {
    if ((!fixture && !hostCapability) || !canEndGame) return;
    if (!window.confirm("End the game early?")) return;
    setEndingGame(true);
    setActionError("");
    try {
      if (fixture) await fixture.end();
      else if (hostCapability) await endGameMutation({ capability: hostCapability });
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Could not end game"));
    } finally {
      setEndingGame(false);
    }
  }

  async function submitResponse(promptId: string) {
    if (!fixture && !playerCapability) return;
    const text = responseText.trim();
    if (!text) return;
    setSubmittingPromptId(promptId);
    setActionError("");
    try {
      if (fixture) {
        await fixture.submitResponse(promptId, text, selectedPromptId);
      } else if (playerCapability) {
        await submitResponseMutation({
          capability: playerCapability,
          promptId: promptId as Id<"prompts">,
          selectedPromptId,
          text,
        });
      }
      setSubmittedPromptIds((previous) => new Set(previous).add(promptId));
      setResponseText("");
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Failed to submit"));
    } finally {
      setSubmittingPromptId(null);
    }
  }

  async function castVote(promptId: string, responseId: string | null) {
    if (!fixture && !playerCapability) return;
    setVotingBusy(true);
    setActionError("");
    try {
      if (fixture) {
        await fixture.castVote(promptId, responseId);
      } else if (playerCapability) {
        await castVoteMutation({
          capability: playerCapability,
          promptId: promptId as Id<"prompts">,
          responseId: responseId ? (responseId as Id<"responses">) : null,
        });
      }
      setVotingPromptIds((previous) => new Set(previous).add(promptId));
    } catch (cause) {
      setActionError(getConvexErrorMessage(cause, "Failed to vote"));
    } finally {
      setVotingBusy(false);
    }
  }

  return {
    actionError,
    activePlayerCount,
    canEndGame,
    capability,
    castVote,
    currentVotePrompt,
    endingGame,
    gameStarted,
    gameState,
    handleEndGame,
    hasSubmittedCurrent,
    hasVotedCurrent,
    hostActionBusy,
    isComebackRound,
    isHost,
    isInitialProfileFailed,
    isInitialProfilePending,
    isOpenerRound,
    isOpenerVoting,
    matchslop,
    openerPromptById,
    openerStep,
    personaAction,
    personaName,
    postHostAction,
    postPersonaAction,
    promptOptions,
    responseText,
    selectedOption,
    setOpenerStep,
    setResponseText,
    setSelectedPromptId,
    setShowPersonaSheet,
    showPersonaButton,
    showPersonaSheet,
    submitResponse,
    submittingPromptId,
    votingBusy,
  };
}
