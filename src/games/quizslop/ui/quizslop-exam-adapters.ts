import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type {
  QuizslopExamAssignment,
  QuizslopExamControllerView,
  QuizslopExamFinal,
  QuizslopExamLobby,
  QuizslopExamProctorReview,
  QuizslopExamPublicAssignment,
  QuizslopExamReceipt,
  QuizslopExamStageView,
} from "./quizslop-exam-contracts";

export type BackendQuizslopStageView = FunctionReturnType<typeof api.quizslopViews.stageView>;
export type BackendQuizslopControllerView = FunctionReturnType<
  typeof api.quizslopViews.controllerView
>;
type BackendCommonView = BackendQuizslopStageView | BackendQuizslopControllerView;
type BackendPairing = BackendCommonView["pairings"][number];
type BackendReceipt = BackendCommonView["receipts"][number];
type BackendPrivateAssignment = NonNullable<BackendQuizslopControllerView["candidateAssignment"]>;

function contentLobby(view: BackendCommonView, canStart: boolean): QuizslopExamLobby {
  return {
    canStart,
    content: {
      source: view.content.source,
      packStatus: view.content.packStatus,
      ...(view.content.generatorModelName
        ? { generatorModelName: view.content.generatorModelName }
        : {}),
    },
  };
}

function score(view: BackendCommonView) {
  return {
    rawCorrect: view.teamScore.rawCorrect,
    totalQuestions: view.teamScore.attempted,
    passingScorePercent: view.passPercent,
    integrityAdjustmentSealed: view.teamScore.integrityAdjustmentSealed,
  };
}

function finalResult(view: BackendCommonView): QuizslopExamFinal | null {
  const final = view.final;
  if (!final) return null;
  return {
    passed: final.passed,
    saboteurName: final.saboteur.name,
    identified: final.saboteurIdentified,
    rawCorrect: final.rawCorrect,
    totalQuestions: view.teamScore.totalQuestions,
    sabotagePoints: final.sabotagePoints,
    deductionsRemoved: final.saboteurIdentified,
    adjustedCorrect: final.adjustedCorrect,
    passingScorePercent: view.passPercent,
  };
}

function receipt(value: BackendReceipt): QuizslopExamReceipt {
  return {
    assignmentId: value.assignmentId,
    candidateName: value.candidate.name,
    proxyName: value.authority === "GROUP" ? null : value.proxy.name,
    topicLabel: value.topic.label,
    prompt: value.displayPrompt,
    choices: value.choices,
    scratchIndex: value.scratchSelectedIndex,
    officialIndex: value.officialSelectedIndex,
    correctIndex: value.correctIndex,
    officialCorrect: value.officialCorrect,
    scratchCorrect: value.scratchCorrect,
    changedCorrectToWrong: value.scratchCorrect && !value.officialCorrect,
    explanation: value.explanation,
    defenses: value.defenses.map((defense) => ({
      playerName: defense.player.name,
      kind: defense.kind,
      text: defense.text,
    })),
  };
}

function common(view: BackendCommonView) {
  const suspension =
    view.roster.find((player) => player.suspendedThisSection) ??
    view.reviewResult?.suspendedPlayer ??
    null;
  return {
    roomCode: view.roomCode,
    phase: view.phase,
    version: view.version,
    sectionNumber: view.sectionNumber,
    totalSections: view.totalSections,
    phaseDeadline: view.phaseDeadline,
    serverNow: view.serverNow,
    timersDisabled: view.timersDisabled,
    score: score(view),
    roster: view.roster.map((player) => ({
      playerId: player.playerId,
      name: player.name,
      seatOrder: player.seatOrder,
      connected: player.connected,
    })),
    sectionTopicLabels: view.pairings.map((pairing) => pairing.topic.label),
    suspension: suspension ? { playerId: suspension.playerId, name: suspension.name } : null,
    receipts: view.receipts.map(receipt),
    final: finalResult(view),
  };
}

/** Global 1-based question number for a pairing at `index`, continuing across sections. */
function questionNumber(view: BackendCommonView, index: number): number {
  return Math.max(0, view.sectionNumber - 1) * Math.max(1, view.pairings.length) + index + 1;
}

function publicAssignment(
  pairing: BackendPairing,
  index: number,
  view: BackendCommonView,
): QuizslopExamPublicAssignment {
  return {
    id: pairing.assignmentId,
    candidate: pairing.candidate,
    proxy: pairing.authority === "GROUP" ? null : pairing.proxy,
    topicLabel: pairing.topic.label,
    questionNumber: questionNumber(view, index),
    proxyMode: pairing.authority === "GROUP" ? "GROUP_VOTE" : "PLAYER",
    suspendedProxyName: pairing.authority === "GROUP" ? pairing.proxy.name : null,
    scratchLocked: pairing.scratchLocked,
    officialLocked: pairing.officialLocked,
  };
}

function privateAssignment(
  value: BackendPrivateAssignment | null,
  kind: "CANDIDATE" | "PROXY" | "GROUP",
  view: BackendCommonView,
): QuizslopExamAssignment | null {
  if (!value) return null;
  const pairing = view.pairings.find((entry) => entry.assignmentId === value.assignmentId);
  if (!pairing) return null;
  const index = view.pairings.indexOf(pairing);
  return {
    id: value.assignmentId,
    candidate: value.candidate,
    proxy: pairing.authority === "GROUP" ? null : pairing.proxy,
    topicLabel: value.topic.label,
    questionNumber: questionNumber(view, index),
    proxyMode: kind === "GROUP" ? "GROUP_VOTE" : "PLAYER",
    suspendedProxyName: kind === "GROUP" ? pairing.proxy.name : null,
    prompt: value.displayPrompt,
    choices: value.choices,
    scratchIndex: kind === "CANDIDATE" ? value.selectedIndex : null,
    scratchLocked: kind === "CANDIDATE" && value.locked,
    officialIndex: kind === "PROXY" ? value.selectedIndex : null,
    officialLocked: kind === "PROXY" && value.locked,
    groupVoteIndex: kind === "GROUP" ? value.selectedIndex : null,
    groupVoteLocked: kind === "GROUP" && value.locked,
  };
}

export function adaptQuizslopStageView(view: BackendQuizslopStageView): QuizslopExamStageView {
  const progress = view.submissionProgress;
  return {
    ...common(view),
    me: { isHost: view.me.isHost, playerId: view.me.playerId },
    lobby: view.lobby ? contentLobby(view, view.lobby.canStart) : null,
    assignments: view.pairings.map((pairing, index) => publicAssignment(pairing, index, view)),
    assignmentProgress: progress ? { locked: progress.resolved, total: progress.total } : null,
    proctorReview:
      view.phase === "PROCTOR_REVIEW_VOTE" || view.phase === "PROCTOR_REVIEW_RESULT"
        ? {
            suspendedPlayerName: view.reviewResult?.suspendedPlayer?.name ?? null,
            votesCast: view.reviewResult?.votesCast ?? progress?.resolved ?? 0,
            votersTotal: view.reviewResult?.votersTotal ?? progress?.total ?? view.roster.length,
          }
        : null,
    hearing:
      view.phase === "FINAL_ACCUSATION"
        ? { votesCast: progress?.resolved ?? 0, votersTotal: progress?.total ?? view.roster.length }
        : null,
  };
}

export function adaptQuizslopControllerView(
  view: BackendQuizslopControllerView,
): QuizslopExamControllerView {
  const progress = view.submissionProgress;
  const adaptedReceipts = view.receipts.map(receipt);
  const myReceiptIndex = view.receipts.findIndex(
    (value) =>
      value.candidate.playerId === view.me.playerId ||
      (value.authority === "PROXY" && value.proxy.playerId === view.me.playerId),
  );
  const myReceipt = adaptedReceipts[myReceiptIndex];
  const orderedReceipts =
    myReceiptIndex > 0 && myReceipt
      ? [myReceipt, ...adaptedReceipts.filter((_, index) => index !== myReceiptIndex)]
      : adaptedReceipts;
  const base = common(view);
  const reviewResult: QuizslopExamProctorReview | null =
    view.phase === "PROCTOR_REVIEW_RESULT"
      ? {
          eligibleTargets: [],
          votedPlayerId: null,
          abstained: false,
          locked: true,
          suspendedPlayerName: view.reviewResult?.suspendedPlayer?.name ?? null,
          votesCast: view.reviewResult?.votesCast ?? 0,
          votersTotal: view.reviewResult?.votersTotal ?? view.roster.length,
        }
      : null;
  return {
    ...base,
    receipts: orderedReceipts,
    me: {
      isHost: view.me.isHost,
      playerId: view.me.playerId,
      name: view.me.name,
    },
    lobby: view.lobby ? contentLobby(view, view.lobby.canStart) : null,
    role: view.phase !== "LOBBY_SETUP" && view.me.role !== null ? { kind: view.me.role } : null,
    candidateAssignment: privateAssignment(view.candidateAssignment, "CANDIDATE", view),
    proxyAssignment: privateAssignment(view.proxyAssignment, "PROXY", view),
    groupVoteAssignment: privateAssignment(view.groupVoteAssignment, "GROUP", view),
    defenses: view.defenses.map((defense) => ({
      assignmentId: defense.assignmentId,
      kind: defense.kind,
      candidateName: defense.candidate.name,
      proxyName: defense.proxy.name,
      prompt: defense.displayPrompt,
      submittedText: defense.submittedText,
      locked: defense.locked,
    })),
    proctorReview: view.suspensionVote
      ? {
          eligibleTargets: view.suspensionVote.targets,
          votedPlayerId: view.suspensionVote.selectedTargetId,
          abstained: view.suspensionVote.abstained,
          locked: view.suspensionVote.locked,
          suspendedPlayerName: null,
          votesCast: progress?.resolved ?? 0,
          votersTotal: progress?.total ?? view.roster.length,
        }
      : reviewResult,
    hearing: view.finalAccusation
      ? {
          eligibleTargets: view.finalAccusation.targets,
          accusedPlayerId: view.finalAccusation.selectedTargetId,
          votesCast: progress?.resolved ?? 0,
          votersTotal: progress?.total ?? view.roster.length,
        }
      : null,
  };
}
