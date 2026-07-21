/**
 * Stateful builder primitives for the scripted QuizSlop UI fixture. Narrative
 * phase sequences live in separate files so the fixture remains reviewable.
 */
import { QUIZSLOP_TOPIC_CATALOG } from "@/games/quizslop/config/topic-catalog";
import { getVoiceLinesForTag } from "@/games/quizslop/config/voice-lines";
import { CALL_SLOP_TOKENS_PER_GAME } from "@/games/quizslop/game-constants";
import type {
  QuizslopCatalogTopic,
  QuizslopPhase,
  QuizslopQuestionContent,
  QuizslopQuestionRuling,
  QuizslopRoundKind,
  QuizslopTier,
  QuizslopVoiceEventTag,
} from "@/games/quizslop/types";
import type {
  QuizslopControllerLobby,
  QuizslopControllerViewPayload,
  QuizslopStageViewPayload,
  QuizslopViewBallot,
  QuizslopViewCallReveal,
  QuizslopViewFinal,
  QuizslopViewHouseVoteStage,
  QuizslopViewCurrentTopic,
  QuizslopViewRevealGroup,
  QuizslopViewRoundDelta,
  QuizslopViewScoreboardEntry,
  QuizslopViewSettledCall,
  QuizslopViewSlateEntry,
  QuizslopViewVoiceLine,
} from "@/games/quizslop/ui/quizslop-view-contracts";

export const QUIZSLOP_FIXTURE_KIND = "QUIZSLOP_FIXTURE" as const;

export type QuizslopFixturePlayerKey = "P1" | "P2" | "P3" | "P4";
export const QUIZSLOP_FIXTURE_PLAYER_KEYS: readonly QuizslopFixturePlayerKey[] = [
  "P1",
  "P2",
  "P3",
  "P4",
];

export interface QuizslopFixtureBeat {
  kind: typeof QUIZSLOP_FIXTURE_KIND;
  slug: string;
  title: string;
  description: string;
  stage: QuizslopStageViewPayload;
  controllers: Record<QuizslopFixturePlayerKey, QuizslopControllerViewPayload>;
}

/* ─── Cast ─── */

const PLAYER_INFO: Record<
  QuizslopFixturePlayerKey,
  { playerId: string; name: string; seatOrder: number }
> = {
  P1: { playerId: "player-priya", name: "Priya", seatOrder: 0 },
  P2: { playerId: "player-marcus", name: "Marcus", seatOrder: 1 },
  P3: { playerId: "player-jo", name: "Jo", seatOrder: 2 },
  P4: { playerId: "player-tal", name: "Tal", seatOrder: 3 },
};

/** Priya plays AND hosts; her controller carries the host tools. */
const HOST_KEY: QuizslopFixturePlayerKey = "P1";
const ROOM_CODE = "QUIZ";
const TOTAL_ROUNDS = 6;

/* ─── Catalog access (real reviewed questions only) ─── */

export const WARMUP_TOPIC = "cat-solar-system";
export const HOME_TOPICS: Record<QuizslopFixturePlayerKey, string> = {
  P1: "cat-music-general",
  P2: "cat-classic-nintendo",
  P3: "cat-studio-ghibli",
  P4: "cat-sharks-ocean",
};
export const FINALIST_TOPICS = [
  "cat-world-capitals",
  "cat-ancient-rome",
  "cat-cheese-dairy",
] as const;
export const FINALE_WINNER_TOPIC = "cat-cheese-dairy";

function catalogTopic(id: string): QuizslopCatalogTopic {
  const topic = QUIZSLOP_TOPIC_CATALOG.find((entry) => entry.id === id);
  if (!topic) throw new Error(`QuizSlop fixture: missing catalog topic ${id}`);
  return topic;
}

export function catalogQuestion(topicId: string, tier: QuizslopTier): QuizslopQuestionContent {
  const question = catalogTopic(topicId).questions.find((entry) => entry.tier === tier);
  if (!question) throw new Error(`QuizSlop fixture: topic ${topicId} has no ${tier} question`);
  return question;
}

export function publicTopic(catalogId: string): QuizslopViewCurrentTopic {
  const topic = catalogTopic(catalogId);
  return {
    topicId: `topic-${catalogId}`,
    label: topic.label,
    scope: topic.scope,
    category: topic.category,
  };
}

export function slateEntry(catalogId: string): QuizslopViewSlateEntry {
  return { ...publicTopic(catalogId), topicId: `slate-${catalogId}` };
}

export function offerFor(catalogId: string): QuizslopControllerLobby["offers"][number] {
  const topic = catalogTopic(catalogId);
  return {
    catalogTopicId: topic.id,
    label: topic.label,
    scope: topic.scope,
    category: topic.category,
  };
}

/* ─── Reveal group construction ─── */

type FixtureAnswerResult = "correct" | "wrong" | "timeout";

export interface RevealGroupDef {
  topicCatalogId: string;
  tier: QuizslopTier;
  results: { key: QuizslopFixturePlayerKey; result: FixtureAnswerResult }[];
  pointValue: number;
  ruling?: QuizslopQuestionRuling | null;
}

export function wrongIndexFor(question: QuizslopQuestionContent): number {
  return (question.correctIndex + 1) % question.choices.length;
}

function buildRevealGroup(def: RevealGroupDef, withSourceUrls: boolean): QuizslopViewRevealGroup {
  const question = catalogQuestion(def.topicCatalogId, def.tier);
  return {
    questionId: question.id,
    systemVoid: false,
    displayPrompt: question.displayPrompt,
    choices: [...question.choices],
    correctIndex: question.correctIndex,
    explanation: question.explanation,
    sources: question.sources.map((source) => ({
      title: source.title,
      url: withSourceUrls ? source.url : null,
    })),
    players: def.results.map((entry) => {
      const info = PLAYER_INFO[entry.key];
      const correct = entry.result === "correct";
      return {
        playerId: info.playerId,
        name: info.name,
        selectedIndex:
          entry.result === "correct"
            ? question.correctIndex
            : entry.result === "wrong"
              ? wrongIndexFor(question)
              : null,
        correct,
        timedOut: entry.result === "timeout",
        provisionalQuizDelta: correct ? def.pointValue : 0,
      };
    }),
    ruling: def.ruling ?? null,
  };
}

export function ballotFor(
  topicCatalogId: string,
  tier: QuizslopTier,
  config: {
    disputeId: string;
    reason: QuizslopViewBallot["reason"];
    initiator: QuizslopFixturePlayerKey;
    votesResolved: number;
    votersTotal: number;
    ruling?: QuizslopQuestionRuling | null;
  },
): QuizslopViewBallot {
  const question = catalogQuestion(topicCatalogId, tier);
  return {
    disputeId: config.disputeId,
    questionId: question.id,
    displayPrompt: question.displayPrompt,
    reason: config.reason,
    initiatorName: PLAYER_INFO[config.initiator].name,
    votesResolved: config.votesResolved,
    votersTotal: config.votersTotal,
    ruling: config.ruling ?? null,
  };
}

/* ─── Roster ledger (kept consistent across beats) ─── */

interface RosterEntry {
  connected: boolean;
  total: number;
  quizSubtotal: number;
  callSubtotal: number;
  tokensRemaining: number;
  disputeAvailable: boolean;
  successfulCalls: number;
  incorrectCalls: number;
  correctAnswers: number;
}

type Roster = Record<QuizslopFixturePlayerKey, RosterEntry>;

function initialRoster(): Roster {
  const entry = (): RosterEntry => ({
    connected: true,
    total: 0,
    quizSubtotal: 0,
    callSubtotal: 0,
    tokensRemaining: CALL_SLOP_TOKENS_PER_GAME,
    disputeAvailable: true,
    successfulCalls: 0,
    incorrectCalls: 0,
    correctAnswers: 0,
  });
  return { P1: entry(), P2: entry(), P3: entry(), P4: entry() };
}

function scoreboardOf(roster: Roster): QuizslopViewScoreboardEntry[] {
  return QUIZSLOP_FIXTURE_PLAYER_KEYS.map((key) => {
    const info = PLAYER_INFO[key];
    const entry = roster[key];
    return {
      playerId: info.playerId,
      name: info.name,
      seatOrder: info.seatOrder,
      connected: entry.connected,
      total: entry.total,
      quizSubtotal: entry.quizSubtotal,
      callSubtotal: entry.callSubtotal,
      tokensRemaining: entry.tokensRemaining,
      disputeAvailable: entry.disputeAvailable,
    };
  });
}

/* ─── Beat factory ─── */

interface ControllerBeatConfig {
  lobby?: QuizslopControllerViewPayload["lobby"];
  houseVote?: QuizslopControllerViewPayload["houseVote"];
  call?: QuizslopControllerViewPayload["call"];
  answer?: QuizslopControllerViewPayload["answer"];
  dispute?: QuizslopControllerViewPayload["dispute"];
  myDisputeVotes?: QuizslopControllerViewPayload["myDisputeVotes"];
}

interface BeatConfig {
  slug: string;
  title: string;
  description: string;
  phase: QuizslopPhase;
  deadlineSeconds: number | null;
  currentRound: number;
  roundKind: QuizslopRoundKind | null;
  pointValue: number;
  voiceTag: QuizslopVoiceEventTag | null;
  participantsFrozen: boolean;
  currentTopic?: QuizslopViewCurrentTopic | null;
  topicOwnerName?: string | null;
  slate?: QuizslopViewSlateEntry[];
  stageLobby?: QuizslopStageViewPayload["lobby"];
  houseVoteStage?: QuizslopViewHouseVoteStage | null;
  callProgress?: { resolvedCount: number; eligibleCount: number } | null;
  callReveal?: QuizslopViewCallReveal[] | null;
  answerProgress?: { lockedCount: number; assignedCount: number } | null;
  revealDefs?: RevealGroupDef[];
  revealOrdinal?: number;
  revealTotal?: number;
  ballots?: QuizslopViewBallot[];
  roundDeltas?: QuizslopViewRoundDelta[];
  settledCalls?: QuizslopViewSettledCall[];
  controllerRoundDeltas?: QuizslopViewRoundDelta[];
  controllerSettledCalls?: QuizslopViewSettledCall[];
  final?: QuizslopViewFinal | null;
  controllers: Record<QuizslopFixturePlayerKey, ControllerBeatConfig>;
}

export function createQuizslopFixtureScript(nowMs: number) {
  const beats: QuizslopFixtureBeat[] = [];
  const roster = initialRoster();
  const serverNow = new Date(nowMs).toISOString();
  let version = 1;

  function voiceLineFor(
    tag: QuizslopVoiceEventTag | null,
    ordinal: number,
  ): QuizslopViewVoiceLine | null {
    if (!tag) return null;
    const lines = getVoiceLinesForTag(tag);
    if (lines.length === 0) return null;
    const line = lines[ordinal % lines.length];
    return line ? { text: line.text, accessibleLabel: line.accessibleLabel } : null;
  }

  function pushBeat(config: BeatConfig): void {
    const deadline =
      config.deadlineSeconds === null
        ? null
        : new Date(nowMs + config.deadlineSeconds * 1000).toISOString();
    const voiceLine = voiceLineFor(config.voiceTag, beats.length);
    const scoreboard = config.participantsFrozen ? scoreboardOf(roster) : [];
    const stageGroups = (config.revealDefs ?? []).map((def) => buildRevealGroup(def, false));
    const controllerGroups = (config.revealDefs ?? []).map((def) => buildRevealGroup(def, true));

    const common = {
      id: "quizslop-fixture-game",
      roomCode: ROOM_CODE,
      phase: config.phase,
      version,
      phaseDeadline: deadline,
      serverNow,
      timersDisabled: false,
      currentRound: config.currentRound,
      totalRounds: config.participantsFrozen ? TOTAL_ROUNDS : 0,
      roundKind: config.roundKind,
      pointValue: config.pointValue,
      voiceLine,
      scoreboard,
      currentTopic: config.currentTopic ?? null,
      topicOwnerName: config.topicOwnerName ?? null,
      slate: config.slate ?? [],
      revealOrdinal: config.revealOrdinal ?? 0,
      revealTotal: config.revealTotal ?? 0,
      ballots: config.ballots ?? [],
      roundDeltas: config.roundDeltas ?? [],
      settledCalls: config.settledCalls ?? [],
      final: config.final ?? null,
    };

    const stage: QuizslopStageViewPayload = {
      ...common,
      revealGroups: stageGroups,
      me: { isHost: true, playerId: null, sessionId: "session-stage" },
      lobby: config.stageLobby ?? null,
      houseVote: config.houseVoteStage ?? null,
      callProgress: config.callProgress ?? null,
      callReveal: config.callReveal ?? null,
      answerProgress: config.answerProgress ?? null,
    };

    const buildController = (key: QuizslopFixturePlayerKey): QuizslopControllerViewPayload => {
      const info = PLAYER_INFO[key];
      const entry = roster[key];
      const perPlayer = config.controllers[key];
      return {
        ...common,
        revealGroups: controllerGroups,
        roundDeltas: config.controllerRoundDeltas ?? config.roundDeltas ?? [],
        settledCalls: config.controllerSettledCalls ?? config.settledCalls ?? [],
        me: {
          isHost: key === HOST_KEY,
          playerId: info.playerId,
          name: info.name,
          isParticipant: config.participantsFrozen,
          tokensRemaining: config.participantsFrozen ? entry.tokensRemaining : 0,
          disputeAvailable: config.participantsFrozen ? entry.disputeAvailable : false,
          total: entry.total,
          quizSubtotal: entry.quizSubtotal,
          callSubtotal: entry.callSubtotal,
        },
        voiceLine,
        lobby: perPlayer.lobby ?? null,
        houseVote: perPlayer.houseVote ?? null,
        call: perPlayer.call ?? null,
        answer: perPlayer.answer ?? null,
        dispute: perPlayer.dispute ?? null,
        disputeVoteEligible: config.phase === "DISPUTE_VOTE",
        myDisputeVotes: perPlayer.myDisputeVotes ?? [],
      };
    };
    const controllers: Record<QuizslopFixturePlayerKey, QuizslopControllerViewPayload> = {
      P1: buildController("P1"),
      P2: buildController("P2"),
      P3: buildController("P3"),
      P4: buildController("P4"),
    };

    beats.push({
      kind: QUIZSLOP_FIXTURE_KIND,
      slug: config.slug,
      title: config.title,
      description: config.description,
      stage,
      controllers,
    });
    version += 1;
  }

  /* ── Shared little builders ── */

  const playerId = (key: QuizslopFixturePlayerKey) => PLAYER_INFO[key].playerId;
  const playerName = (key: QuizslopFixturePlayerKey) => PLAYER_INFO[key].name;

  function callTargets(keys: QuizslopFixturePlayerKey[], self: QuizslopFixturePlayerKey) {
    return keys
      .filter((key) => key !== self)
      .map((key) => ({ playerId: playerId(key), name: playerName(key) }));
  }

  function callReveal(pairs: [QuizslopFixturePlayerKey, QuizslopFixturePlayerKey][]) {
    return pairs.map(([caller, target]) => ({
      callerId: playerId(caller),
      callerName: playerName(caller),
      targetId: playerId(target),
      targetName: playerName(target),
    }));
  }

  function answerFor(
    topicCatalogId: string,
    tier: QuizslopTier,
    state: { selectedIndex: number | null; locked: boolean },
  ): NonNullable<QuizslopControllerViewPayload["answer"]> {
    const question = catalogQuestion(topicCatalogId, tier);
    return {
      assigned: true,
      displayPrompt: question.displayPrompt,
      choices: [...question.choices],
      selectedIndex: state.selectedIndex,
      locked: state.locked,
    };
  }

  const exemptAnswer: NonNullable<QuizslopControllerViewPayload["answer"]> = {
    assigned: false,
    displayPrompt: null,
    choices: null,
    selectedIndex: null,
    locked: false,
  };

  function deltas(
    values: Partial<Record<QuizslopFixturePlayerKey, { quiz: number; call: number }>>,
  ): QuizslopViewRoundDelta[] {
    return QUIZSLOP_FIXTURE_PLAYER_KEYS.flatMap((key) => {
      const value = values[key];
      if (!value) return [];
      return [
        {
          playerId: playerId(key),
          name: playerName(key),
          quizDelta: value.quiz,
          callDelta: value.call,
        },
      ];
    });
  }

  function settled(
    calls: {
      caller: QuizslopFixturePlayerKey;
      target: QuizslopFixturePlayerKey;
      outcome: QuizslopViewSettledCall["outcome"];
      delta: number;
    }[],
  ): QuizslopViewSettledCall[] {
    return calls.map((call) => ({
      callerName: playerName(call.caller),
      targetName: playerName(call.target),
      outcome: call.outcome,
      callDelta: call.delta,
    }));
  }

  function applySettlement(
    updates: Partial<
      Record<
        QuizslopFixturePlayerKey,
        {
          quiz?: number;
          call?: number;
          spendToken?: boolean;
          refundToken?: boolean;
          spendDispute?: boolean;
          wonCall?: boolean;
          lostCall?: boolean;
          answeredCorrectly?: boolean;
        }
      >
    >,
  ): void {
    for (const key of QUIZSLOP_FIXTURE_PLAYER_KEYS) {
      const update = updates[key];
      if (!update) continue;
      const entry = roster[key];
      entry.quizSubtotal += update.quiz ?? 0;
      entry.callSubtotal += update.call ?? 0;
      entry.total = entry.quizSubtotal + entry.callSubtotal;
      if (update.spendToken) entry.tokensRemaining -= 1;
      if (update.refundToken) entry.tokensRemaining += 1;
      if (update.spendDispute) entry.disputeAvailable = false;
      if (update.wonCall) entry.successfulCalls += 1;
      if (update.lostCall) entry.incorrectCalls += 1;
      if (update.answeredCorrectly) entry.correctAnswers += 1;
    }
  }

  const noControllers: Record<QuizslopFixturePlayerKey, ControllerBeatConfig> = {
    P1: {},
    P2: {},
    P3: {},
    P4: {},
  };

  return {
    beats,
    roster,
    pushBeat,
    playerId,
    playerName,
    callTargets,
    callReveal,
    answerFor,
    exemptAnswer,
    deltas,
    settled,
    applySettlement,
    noControllers,
  };
}

export type QuizslopFixtureScript = ReturnType<typeof createQuizslopFixtureScript>;
