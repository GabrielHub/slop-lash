"use client";

import type { QuizslopDisputeReason, QuizslopDisputeVoteChoice } from "../types";
import { CategoryTag, PointValueTag, RoundKindBadge, TrophyIcon } from "./quizslop-shared-ui";
import {
  ControllerAnswer,
  ControllerHouseVote,
  ControllerLobby,
  ControllerReveal,
  ControllerSlopCall,
} from "./quizslop-controller-phases";
import {
  ControllerDisputeVote,
  ControllerDisputeWindow,
  ControllerFinal,
  ControllerGraceWait,
  ControllerPassiveWait,
  ControllerRoundResults,
} from "./quizslop-controller-outcome-phases";
import {
  StageAnswer,
  StageCallReveal,
  StageHouseVote,
  StageLobby,
  StageSlopCall,
  StageTopicReveal,
} from "./quizslop-stage-phases";
import {
  StageDisputeVote,
  StageFinal,
  StageQuestionReveal,
  StageRoundResults,
} from "./quizslop-stage-outcome-phases";
import type {
  QuizslopControllerViewPayload,
  QuizslopStageViewPayload,
} from "./quizslop-view-contracts";

function unexpectedPhase(phase: never): never {
  throw new Error(`Unhandled QuizSlop phase: ${String(phase)}`);
}

/** The id embedded in a prefixed busy marker (e.g. "topic:abc" -> "abc"). */
function busyIdFor(busyAction: string | null, prefix: string): string | null {
  return busyAction?.startsWith(prefix) ? busyAction.slice(prefix.length) : null;
}

function controllerStartLabel(
  lobby: NonNullable<QuizslopControllerViewPayload["lobby"]>,
  busyAction: string | null,
): string {
  if (busyAction === "host:start") return "Starting...";
  if (lobby.packStatus === "PENDING" || lobby.packStatus === "GENERATING") {
    return "Building question pack...";
  }
  if (lobby.packStatus === "FAILED") return "Question pack unavailable";
  if (lobby.canStart) return "Start the show";
  return `Need ${lobby.minPlayers}–${lobby.maxPlayers} connected and ready`;
}

export function QuizslopStagePhaseContent({
  view,
  isHost,
  starting,
  onStart,
}: {
  view: QuizslopStageViewPayload;
  isHost: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  switch (view.phase) {
    case "LOBBY_SETUP":
      return view.lobby ? (
        <StageLobby
          roomCode={view.roomCode}
          lobby={view.lobby}
          isHost={isHost}
          starting={starting}
          onStart={onStart}
        />
      ) : null;
    case "HOUSE_VOTE":
    case "HOUSE_VOTE_REVEAL":
      return view.houseVote ? (
        <StageHouseVote
          slate={view.slate}
          houseVote={view.houseVote}
          reveal={view.phase === "HOUSE_VOTE_REVEAL"}
          winnerTopic={view.currentTopic}
        />
      ) : null;
    case "TOPIC_REVEAL":
      return view.currentTopic && view.roundKind ? (
        <StageTopicReveal
          topic={view.currentTopic}
          roundKind={view.roundKind}
          ownerName={view.topicOwnerName}
          pointValue={view.pointValue}
        />
      ) : null;
    case "SLOP_CALL":
      return view.callProgress ? <StageSlopCall callProgress={view.callProgress} /> : null;
    case "SLOP_CALL_REVEAL":
      return <StageCallReveal callReveal={view.callReveal ?? []} />;
    case "ANSWER":
      return view.answerProgress ? <StageAnswer answerProgress={view.answerProgress} /> : null;
    case "QUESTION_REVEAL":
      return (
        <StageQuestionReveal
          revealGroups={view.revealGroups}
          revealOrdinal={view.revealOrdinal}
          revealTotal={view.revealTotal}
          ballots={view.ballots}
        />
      );
    case "DISPUTE_VOTE":
      return (
        <StageDisputeVote
          ballots={view.ballots}
          revealGroups={view.revealGroups}
          rulingOrdinal={view.revealOrdinal}
        />
      );
    case "ROUND_RESULTS":
    case "CONTINUITY_GRACE":
      return (
        <StageRoundResults
          roundDeltas={view.roundDeltas}
          settledCalls={view.settledCalls}
          ballots={view.ballots}
          currentRound={view.currentRound}
          totalRounds={view.totalRounds}
          graceMessage={view.phase === "CONTINUITY_GRACE"}
        />
      );
    case "FINAL_RESULTS":
    case "ABANDONED":
      return view.final ? (
        <StageFinal final={view.final} abandoned={view.phase === "ABANDONED"} isHost={isHost} />
      ) : null;
    default:
      return unexpectedPhase(view.phase);
  }
}

type ControllerPhaseActions = {
  chooseTopic: (catalogTopicId: string) => void;
  castHouseVote: (topicId: string) => void;
  submitCall: (targetPlayerId: string | null) => void;
  lockAnswer: (selectedIndex: number) => void;
  initiateDispute: (questionId: string, reason: QuizslopDisputeReason) => void;
  castDisputeVote: (disputeId: string, choice: QuizslopDisputeVoteChoice) => void;
  start: () => void;
};

export function QuizslopControllerPhaseContent({
  view,
  isHost,
  busyAction,
  topicTakenNotice,
  disputeNotice,
  actions,
}: {
  view: QuizslopControllerViewPayload;
  isHost: boolean;
  busyAction: string | null;
  topicTakenNotice: string | null;
  disputeNotice: string | null;
  actions: ControllerPhaseActions;
}) {
  switch (view.phase) {
    case "LOBBY_SETUP":
      return view.lobby ? (
        <div className="flex flex-col gap-4">
          <ControllerLobby
            lobby={view.lobby}
            busyTopicId={busyIdFor(busyAction, "topic:")}
            topicTakenNotice={topicTakenNotice}
            onChooseTopic={actions.chooseTopic}
          />
          {isHost && (
            <button
              type="button"
              disabled={!view.lobby.canStart || busyAction !== null}
              onClick={actions.start}
              className="cursor-pointer rounded-2xl px-4 py-4 font-display text-lg font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--qs-marquee)", color: "var(--qs-accent-ink)" }}
            >
              {controllerStartLabel(view.lobby, busyAction)}
            </button>
          )}
        </div>
      ) : (
        <ControllerPassiveWait
          title="Lobby"
          text="You're hosting a display-only stage. Players pick topics on their phones."
        />
      );
    case "HOUSE_VOTE":
      return view.houseVote ? (
        <ControllerHouseVote
          slate={view.slate}
          eligible={view.houseVote.eligible}
          myVoteTopicId={view.houseVote.myVoteTopicId}
          busyTopicId={busyIdFor(busyAction, "vote:")}
          onVote={actions.castHouseVote}
        />
      ) : (
        <ControllerPassiveWait title="Final vote" text="The room is voting the final topic." />
      );
    case "HOUSE_VOTE_REVEAL":
      return (
        <ControllerPassiveWait
          title="Vote reveal"
          text="Eyes on the stage — the winning topic is up."
        />
      );
    case "TOPIC_REVEAL":
      return view.currentTopic && view.roundKind ? (
        <section className="flex flex-col items-center gap-3 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <RoundKindBadge kind={view.roundKind} />
            <CategoryTag category={view.currentTopic.category} />
            <PointValueTag
              pointValue={view.pointValue}
              finale={view.roundKind === "HOUSE_CHOICE"}
            />
          </div>
          <h2
            className="text-balance font-display text-3xl font-black leading-tight"
            style={{ color: "var(--qs-marquee)" }}
          >
            {view.currentTopic.label}
          </h2>
          <p className="text-sm" style={{ color: "var(--qs-ink-dim)" }}>
            {view.currentTopic.scope}
          </p>
          {view.topicOwnerName && (
            <p
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-sm font-bold"
              style={{ borderColor: "var(--qs-signal)", background: "var(--qs-signal-soft)" }}
            >
              <TrophyIcon size={13} /> {view.topicOwnerName}&apos;s Home Turf
            </p>
          )}
        </section>
      ) : null;
    case "SLOP_CALL":
      return view.call ? (
        <ControllerSlopCall
          call={view.call}
          tokensRemaining={view.me.tokensRemaining}
          busy={busyAction === "call"}
          onSubmit={actions.submitCall}
        />
      ) : (
        <ControllerPassiveWait title="Call Slop" text="Calls are locking in around the room." />
      );
    case "SLOP_CALL_REVEAL":
      return (
        <ControllerPassiveWait
          title="Call reveal"
          text="Eyes on the stage — the stamps are landing."
        />
      );
    case "ANSWER":
      return view.answer ? (
        <ControllerAnswer
          answer={view.answer}
          busy={busyAction === "answer"}
          onLock={actions.lockAnswer}
        />
      ) : (
        <ControllerPassiveWait
          title="Answering"
          text="Private questions are live on player phones."
        />
      );
    case "QUESTION_REVEAL":
      return view.dispute ? (
        <ControllerDisputeWindow
          dispute={view.dispute}
          revealGroups={view.revealGroups}
          revealOrdinal={view.revealOrdinal}
          revealTotal={view.revealTotal}
          showAll={false}
          ballots={view.ballots}
          mePlayerId={view.me.playerId}
          busy={busyAction === "dispute"}
          notice={disputeNotice}
          onInitiate={actions.initiateDispute}
        />
      ) : (
        <ControllerReveal
          revealGroups={view.revealGroups}
          revealOrdinal={view.revealOrdinal}
          revealTotal={view.revealTotal}
          mePlayerId={view.me.playerId}
          showAll={false}
        />
      );
    case "DISPUTE_VOTE":
      return (
        <ControllerDisputeVote
          ballots={view.ballots}
          revealGroups={view.revealGroups}
          rulingOrdinal={view.revealOrdinal}
          eligible={view.disputeVoteEligible}
          myDisputeVotes={view.myDisputeVotes}
          busyDisputeId={busyIdFor(busyAction, "ballot:")}
          onVote={actions.castDisputeVote}
        />
      );
    case "ROUND_RESULTS":
      return (
        <ControllerRoundResults
          me={view.me}
          roundDeltas={view.roundDeltas}
          currentRound={view.currentRound}
          totalRounds={view.totalRounds}
        />
      );
    case "CONTINUITY_GRACE":
      return <ControllerGraceWait />;
    case "FINAL_RESULTS":
    case "ABANDONED":
      return view.final ? (
        <ControllerFinal
          final={view.final}
          mePlayerId={view.me.playerId}
          abandoned={view.phase === "ABANDONED"}
        />
      ) : null;
    default:
      return unexpectedPhase(view.phase);
  }
}
