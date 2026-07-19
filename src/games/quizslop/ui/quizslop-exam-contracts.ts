/**
 * Presentational contract for the cooperative S.L.O.P. exam.
 *
 * These IDs intentionally remain plain strings so Convex branded IDs and the
 * deterministic /dev/ui fixture can both feed the same components. Keep
 * server-only answer keys and the hidden role out of the stage payload until
 * the corresponding receipt/final reveal exists.
 */

export type QuizslopExamPhase =
  | "LOBBY_SETUP"
  | "SECTION_INTRO"
  | "SCRATCH"
  | "PROXY_ANSWER"
  | "ORAL_DEFENSE"
  | "SECTION_RESULTS"
  | "PROCTOR_REVIEW_VOTE"
  | "PROCTOR_REVIEW_RESULT"
  | "FINAL_ACCUSATION"
  | "FINAL_RESULTS";

type QuizslopExamRole = "CREW" | "SABOTEUR";
type QuizslopProxyMode = "PLAYER" | "GROUP_VOTE";

export interface QuizslopExamPlayer {
  playerId: string;
  name: string;
  seatOrder: number;
  connected: boolean;
}

export interface QuizslopExamScore {
  rawCorrect: number;
  totalQuestions: number;
  passingScorePercent: number;
  /** No live deduction delta: revealing one could identify the wrong Proxy. */
  integrityAdjustmentSealed: boolean;
}

export interface QuizslopExamPerson {
  playerId: string;
  name: string;
}

export interface QuizslopExamAssignment {
  id: string;
  candidate: QuizslopExamPerson;
  proxy: QuizslopExamPerson | null;
  topicLabel: string;
  questionNumber: number;
  proxyMode: QuizslopProxyMode;
  suspendedProxyName: string | null;
  prompt: string | null;
  choices: string[] | null;
  scratchIndex: number | null;
  scratchLocked: boolean;
  officialIndex: number | null;
  officialLocked: boolean;
  groupVoteIndex: number | null;
  groupVoteLocked: boolean;
}

export interface QuizslopExamPublicAssignment {
  id: string;
  candidate: QuizslopExamPerson;
  proxy: QuizslopExamPerson | null;
  topicLabel: string;
  questionNumber: number;
  proxyMode: QuizslopProxyMode;
  suspendedProxyName: string | null;
  scratchLocked: boolean;
  officialLocked: boolean;
}

export interface QuizslopExamReceipt {
  assignmentId: string;
  candidateName: string;
  proxyName: string | null;
  topicLabel: string;
  prompt: string;
  choices: string[];
  scratchIndex: number | null;
  officialIndex: number | null;
  correctIndex: number;
  officialCorrect: boolean;
  scratchCorrect: boolean;
  changedCorrectToWrong: boolean;
  explanation: string;
  defenses: { playerName: string; kind: "CANDIDATE" | "PROXY"; text: string }[];
}

export interface QuizslopExamDefenseTask {
  assignmentId: string;
  kind: "CANDIDATE" | "PROXY";
  candidateName: string;
  proxyName: string;
  prompt: string;
  submittedText: string | null;
  locked: boolean;
}

export interface QuizslopExamProctorReview {
  eligibleTargets: QuizslopExamPerson[];
  votedPlayerId: string | null;
  abstained: boolean;
  locked: boolean;
  suspendedPlayerName: string | null;
  votesCast: number;
  votersTotal: number;
}

interface QuizslopExamHearing {
  eligibleTargets: QuizslopExamPerson[];
  accusedPlayerId: string | null;
  votesCast: number;
  votersTotal: number;
}

export interface QuizslopExamFinal {
  passed: boolean;
  saboteurName: string;
  identified: boolean;
  rawCorrect: number;
  totalQuestions: number;
  sabotagePoints: number;
  deductionsRemoved: boolean;
  adjustedCorrect: number;
  passingScorePercent: number;
}

interface QuizslopExamViewCommon {
  roomCode: string;
  phase: QuizslopExamPhase;
  version: number;
  sectionNumber: number;
  totalSections: number;
  phaseDeadline: string | null;
  serverNow: string;
  timersDisabled: boolean;
  score: QuizslopExamScore;
  roster: QuizslopExamPlayer[];
  sectionTopicLabels: string[];
  suspension: { playerId: string; name: string } | null;
  receipts: QuizslopExamReceipt[];
  final: QuizslopExamFinal | null;
}

export interface QuizslopExamLobby {
  canStart: boolean;
  content: {
    source: "CATALOG" | "AI";
    packStatus: "CATALOG_READY" | "PENDING" | "GENERATING" | "READY" | "FALLBACK" | "FAILED";
    generatorModelName?: string;
  };
}

export interface QuizslopExamStageView extends QuizslopExamViewCommon {
  me: { isHost: boolean; playerId: string | null };
  lobby: QuizslopExamLobby | null;
  assignments: QuizslopExamPublicAssignment[];
  assignmentProgress: { locked: number; total: number } | null;
  proctorReview: Omit<
    QuizslopExamProctorReview,
    "eligibleTargets" | "votedPlayerId" | "abstained" | "locked"
  > | null;
  hearing: Pick<QuizslopExamHearing, "votesCast" | "votersTotal"> | null;
}

export interface QuizslopExamControllerView extends QuizslopExamViewCommon {
  me: {
    isHost: boolean;
    playerId: string | null;
    name: string | null;
  };
  lobby: QuizslopExamLobby | null;
  role: { kind: QuizslopExamRole } | null;
  candidateAssignment: QuizslopExamAssignment | null;
  proxyAssignment: QuizslopExamAssignment | null;
  /** Additional private ballot created when a suspended Proxy loses their assignment. */
  groupVoteAssignment: QuizslopExamAssignment | null;
  defenses: QuizslopExamDefenseTask[];
  proctorReview: QuizslopExamProctorReview | null;
  hearing: QuizslopExamHearing | null;
}

export interface QuizslopExamControllerActions {
  start: () => void;
  removePlayer: (playerId: string) => void;
  submitScratch: (selectedIndex: number) => void;
  submitProxyAnswer: (selectedIndex: number) => void;
  submitGroupAnswer: (selectedIndex: number) => void;
  submitDefense: (assignmentId: string, text: string) => void;
  castSuspensionVote: (targetPlayerId: string | null) => void;
  castFinalAccusation: (targetPlayerId: string) => void;
}

export interface QuizslopExamStageActions {
  start: () => void;
  advance: () => void;
  removePlayer: (playerId: string) => void;
}

export function quizslopExamPercent(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.round((correct / total) * 100));
}

export function quizslopExamContentReady(lobby: QuizslopExamLobby): boolean {
  return ["CATALOG_READY", "READY", "FALLBACK"].includes(lobby.content.packStatus);
}
