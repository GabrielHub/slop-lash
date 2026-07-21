import type {
  QuizslopAwardKind,
  QuizslopCategory,
  QuizslopDisputeReason,
  QuizslopDisputeVoteChoice,
  QuizslopPhase,
  QuizslopQuestionRuling,
  QuizslopRoundKind,
  QuizslopTopicSetupState,
} from "../types";

/**
 * Structural mirrors of the convex/quizslopViews.ts payload validators.
 *
 * The presentational components in this folder are typed against these
 * contracts so the Milestone 0 fixture (plain string IDs) and the production
 * shells (branded Convex IDs, which are string subtypes) feed the exact same
 * components. quizslop-game-shell.tsx and quizslop-controller-shell.tsx carry
 * compile-time assertions that the live query payloads stay assignable to
 * these shapes.
 */

export interface QuizslopViewVoiceLine {
  text: string;
  accessibleLabel: string;
}

export interface QuizslopViewScoreboardEntry {
  playerId: string;
  name: string;
  seatOrder: number;
  connected: boolean;
  total: number;
  quizSubtotal: number;
  callSubtotal: number;
  tokensRemaining: number;
  disputeAvailable: boolean;
}

export interface QuizslopViewLobbyStatus {
  playerId: string;
  name: string;
  connected: boolean;
  state: QuizslopTopicSetupState;
}

export type QuizslopViewPackStatus =
  | "CATALOG_READY"
  | "PENDING"
  | "GENERATING"
  | "READY"
  | "FALLBACK"
  | "FAILED";

export interface QuizslopViewPublicTopic {
  label: string;
  scope: string;
  category: QuizslopCategory;
}

export interface QuizslopViewCurrentTopic extends QuizslopViewPublicTopic {
  topicId: string;
}

/** A slate entry is structurally an identified topic; kept as a named alias. */
export type QuizslopViewSlateEntry = QuizslopViewCurrentTopic;

export interface QuizslopViewRevealGroupPlayer {
  playerId: string;
  name: string;
  selectedIndex: number | null;
  correct: boolean;
  timedOut: boolean;
  provisionalQuizDelta: number;
}

export interface QuizslopViewRevealGroup {
  questionId: string;
  systemVoid: boolean;
  displayPrompt: string | null;
  choices: string[] | null;
  correctIndex: number | null;
  explanation: string | null;
  sources: { title: string; url: string | null }[];
  players: QuizslopViewRevealGroupPlayer[];
  ruling: QuizslopQuestionRuling | null;
}

export interface QuizslopViewBallot {
  disputeId: string;
  questionId: string;
  displayPrompt: string;
  reason: QuizslopDisputeReason;
  initiatorName: string;
  votesResolved: number;
  votersTotal: number;
  ruling: QuizslopQuestionRuling | null;
}

export interface QuizslopViewCallReveal {
  callerId: string;
  callerName: string;
  targetId: string;
  targetName: string;
}

export interface QuizslopViewSettledCall {
  callerName: string;
  targetName: string;
  outcome: "WON" | "LOST" | "REFUNDED";
  callDelta: number;
}

export interface QuizslopViewRoundDelta {
  playerId: string;
  name: string;
  quizDelta: number;
  callDelta: number;
}

export interface QuizslopViewAward {
  kind: QuizslopAwardKind;
  recipients: string[];
  stat: string;
}

export interface QuizslopViewStanding {
  playerId: string;
  name: string;
  total: number;
  quizSubtotal: number;
  successfulCalls: number;
  winner: boolean;
}

export interface QuizslopViewFinal {
  standings: QuizslopViewStanding[];
  awards: QuizslopViewAward[];
}

export interface QuizslopViewHouseVoteStage {
  resolvedCount: number;
  eligibleCount: number;
  voteCounts: { topicId: string; votes: number }[] | null;
}

/** Chrome fields shared by both views. */
interface QuizslopViewCommon {
  id: string;
  roomCode: string;
  phase: QuizslopPhase;
  version: number;
  phaseDeadline: string | null;
  serverNow: string;
  timersDisabled: boolean;
  currentRound: number;
  totalRounds: number;
  roundKind: QuizslopRoundKind | null;
  pointValue: number;
  voiceLine: QuizslopViewVoiceLine | null;
  scoreboard: QuizslopViewScoreboardEntry[];
  currentTopic: QuizslopViewCurrentTopic | null;
  topicOwnerName: string | null;
  slate: QuizslopViewSlateEntry[];
  revealGroups: QuizslopViewRevealGroup[];
  revealOrdinal: number;
  revealTotal: number;
  ballots: QuizslopViewBallot[];
  roundDeltas: QuizslopViewRoundDelta[];
  settledCalls: QuizslopViewSettledCall[];
  final: QuizslopViewFinal | null;
}

export interface QuizslopStageViewPayload extends QuizslopViewCommon {
  me: {
    isHost: boolean;
    playerId: string | null;
    sessionId: string;
  };
  lobby: {
    packStatus: QuizslopViewPackStatus;
    statuses: QuizslopViewLobbyStatus[];
    canStart: boolean;
    minPlayers: number;
    maxPlayers: number;
  } | null;
  houseVote: QuizslopViewHouseVoteStage | null;
  callProgress: { resolvedCount: number; eligibleCount: number } | null;
  callReveal: QuizslopViewCallReveal[] | null;
  answerProgress: { lockedCount: number; assignedCount: number } | null;
}

export interface QuizslopControllerLobby {
  packStatus: QuizslopViewPackStatus;
  myTopicState: QuizslopTopicSetupState;
  myTopic: QuizslopViewPublicTopic | null;
  myCatalogTopicId: string | null;
  offers: {
    catalogTopicId: string;
    label: string;
    scope: string;
    category: QuizslopCategory;
  }[];
  everyoneReady: boolean;
  canStart: boolean;
  minPlayers: number;
  maxPlayers: number;
}

export interface QuizslopControllerViewPayload extends QuizslopViewCommon {
  me: {
    isHost: boolean;
    playerId: string | null;
    name: string | null;
    isParticipant: boolean;
    tokensRemaining: number;
    disputeAvailable: boolean;
    total: number;
    quizSubtotal: number;
    callSubtotal: number;
  };
  lobby: QuizslopControllerLobby | null;
  houseVote: { eligible: boolean; myVoteTopicId: string | null } | null;
  call: {
    eligible: boolean;
    targets: { playerId: string; name: string }[];
    resolved: boolean;
    myTargetId: string | null;
    held: boolean;
  } | null;
  answer: {
    assigned: boolean;
    displayPrompt: string | null;
    choices: string[] | null;
    selectedIndex: number | null;
    locked: boolean;
  } | null;
  dispute: { canInitiate: boolean; challengeableQuestionIds: string[] } | null;
  disputeVoteEligible: boolean;
  myDisputeVotes: { disputeId: string; choice: QuizslopDisputeVoteChoice }[];
}

/** Result unions mirrored from convex/quizslop.ts mutations. */
export type QuizslopChooseTopicResult =
  | { kind: "CONFIRMED"; topicId: string }
  | { kind: "TOPIC_TAKEN" };

export type QuizslopInitiateDisputeResult =
  | { kind: "OPENED"; disputeId: string }
  | { kind: "ALREADY_OPEN" };
