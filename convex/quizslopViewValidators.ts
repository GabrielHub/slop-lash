import { v } from "convex/values";
import {
  quizslopCategoryValidator,
  quizslopDisputeReasonValidator,
  quizslopPhaseValidator,
  quizslopQuestionRulingValidator,
  quizslopRoundKindValidator,
  quizslopTopicSetupStateValidator,
} from "./quizslopValidators";

const publicTopicValidator = v.object({
  label: v.string(),
  scope: v.string(),
  category: quizslopCategoryValidator,
});

const slateEntryValidator = v.object({
  topicId: v.id("quizSlopTopics"),
  label: v.string(),
  scope: v.string(),
  category: quizslopCategoryValidator,
});

const scoreboardEntryValidator = v.object({
  playerId: v.id("players"),
  name: v.string(),
  seatOrder: v.number(),
  connected: v.boolean(),
  total: v.number(),
  quizSubtotal: v.number(),
  callSubtotal: v.number(),
  tokensRemaining: v.number(),
  disputeAvailable: v.boolean(),
});

const revealGroupValidator = v.object({
  questionId: v.id("quizSlopQuestions"),
  systemVoid: v.boolean(),
  displayPrompt: v.union(v.string(), v.null()),
  choices: v.union(v.array(v.string()), v.null()),
  correctIndex: v.union(v.number(), v.null()),
  explanation: v.union(v.string(), v.null()),
  sources: v.array(v.object({ title: v.string(), url: v.union(v.string(), v.null()) })),
  players: v.array(
    v.object({
      playerId: v.id("players"),
      name: v.string(),
      selectedIndex: v.union(v.number(), v.null()),
      correct: v.boolean(),
      timedOut: v.boolean(),
      provisionalQuizDelta: v.number(),
    }),
  ),
  ruling: v.union(quizslopQuestionRulingValidator, v.null()),
});

const ballotValidator = v.object({
  disputeId: v.id("quizSlopDisputes"),
  questionId: v.id("quizSlopQuestions"),
  displayPrompt: v.string(),
  reason: quizslopDisputeReasonValidator,
  initiatorName: v.string(),
  votesResolved: v.number(),
  votersTotal: v.number(),
  ruling: v.union(quizslopQuestionRulingValidator, v.null()),
});

const settledCallValidator = v.object({
  callerName: v.string(),
  targetName: v.string(),
  outcome: v.union(v.literal("WON"), v.literal("LOST"), v.literal("REFUNDED")),
  callDelta: v.number(),
});

const finalValidator = v.union(
  v.object({
    standings: v.array(
      v.object({
        playerId: v.id("players"),
        name: v.string(),
        total: v.number(),
        quizSubtotal: v.number(),
        successfulCalls: v.number(),
        winner: v.boolean(),
      }),
    ),
    awards: v.array(
      v.object({
        kind: v.union(
          v.literal("CALLED_IT"),
          v.literal("FALSE_ALARM_DEPARTMENT"),
          v.literal("SUSPICIOUSLY_WELL_READ"),
        ),
        recipients: v.array(v.string()),
        stat: v.string(),
      }),
    ),
  }),
  v.null(),
);

const sharedViewFields = {
  id: v.id("games"),
  roomCode: v.string(),
  phase: quizslopPhaseValidator,
  version: v.number(),
  phaseDeadline: v.union(v.string(), v.null()),
  serverNow: v.string(),
  timersDisabled: v.boolean(),
  currentRound: v.number(),
  totalRounds: v.number(),
  roundKind: v.union(quizslopRoundKindValidator, v.null()),
  pointValue: v.number(),
  voiceLine: v.union(v.object({ text: v.string(), accessibleLabel: v.string() }), v.null()),
  scoreboard: v.array(scoreboardEntryValidator),
  currentTopic: v.union(publicTopicValidator, v.null()),
  topicOwnerName: v.union(v.string(), v.null()),
  slate: v.array(slateEntryValidator),
  revealGroups: v.array(revealGroupValidator),
  revealOrdinal: v.number(),
  revealTotal: v.number(),
  ballots: v.array(ballotValidator),
  roundDeltas: v.array(
    v.object({
      playerId: v.id("players"),
      name: v.string(),
      quizDelta: v.number(),
      callDelta: v.number(),
    }),
  ),
  settledCalls: v.array(settledCallValidator),
  final: finalValidator,
};

export const stageViewValidator = v.object({
  ...sharedViewFields,
  me: v.object({
    isHost: v.boolean(),
    playerId: v.union(v.id("players"), v.null()),
    sessionId: v.id("playerSessions"),
  }),
  lobby: v.union(
    v.object({
      statuses: v.array(
        v.object({
          playerId: v.id("players"),
          name: v.string(),
          connected: v.boolean(),
          state: quizslopTopicSetupStateValidator,
        }),
      ),
      canStart: v.boolean(),
      minPlayers: v.number(),
    }),
    v.null(),
  ),
  houseVote: v.union(
    v.object({
      resolvedCount: v.number(),
      eligibleCount: v.number(),
      voteCounts: v.union(
        v.array(v.object({ topicId: v.id("quizSlopTopics"), votes: v.number() })),
        v.null(),
      ),
    }),
    v.null(),
  ),
  callProgress: v.union(
    v.object({ resolvedCount: v.number(), eligibleCount: v.number() }),
    v.null(),
  ),
  callReveal: v.union(
    v.array(
      v.object({
        callerId: v.id("players"),
        callerName: v.string(),
        targetId: v.id("players"),
        targetName: v.string(),
      }),
    ),
    v.null(),
  ),
  answerProgress: v.union(
    v.object({ lockedCount: v.number(), assignedCount: v.number() }),
    v.null(),
  ),
});

export const controllerViewValidator = v.object({
  ...sharedViewFields,
  me: v.object({
    isHost: v.boolean(),
    playerId: v.union(v.id("players"), v.null()),
    name: v.union(v.string(), v.null()),
    isParticipant: v.boolean(),
    tokensRemaining: v.number(),
    disputeAvailable: v.boolean(),
    total: v.number(),
    quizSubtotal: v.number(),
    callSubtotal: v.number(),
  }),
  lobby: v.union(
    v.object({
      myTopicState: quizslopTopicSetupStateValidator,
      myTopic: v.union(publicTopicValidator, v.null()),
      myCatalogTopicId: v.union(v.string(), v.null()),
      offers: v.array(
        v.object({
          catalogTopicId: v.string(),
          label: v.string(),
          scope: v.string(),
          category: quizslopCategoryValidator,
        }),
      ),
      everyoneReady: v.boolean(),
      canStart: v.boolean(),
    }),
    v.null(),
  ),
  houseVote: v.union(
    v.object({
      eligible: v.boolean(),
      myVoteTopicId: v.union(v.id("quizSlopTopics"), v.null()),
    }),
    v.null(),
  ),
  call: v.union(
    v.object({
      eligible: v.boolean(),
      targets: v.array(v.object({ playerId: v.id("players"), name: v.string() })),
      resolved: v.boolean(),
      myTargetId: v.union(v.id("players"), v.null()),
      held: v.boolean(),
    }),
    v.null(),
  ),
  answer: v.union(
    v.object({
      assigned: v.boolean(),
      displayPrompt: v.union(v.string(), v.null()),
      choices: v.union(v.array(v.string()), v.null()),
      selectedIndex: v.union(v.number(), v.null()),
      locked: v.boolean(),
    }),
    v.null(),
  ),
  dispute: v.union(
    v.object({
      canInitiate: v.boolean(),
      challengeableQuestionIds: v.array(v.id("quizSlopQuestions")),
    }),
    v.null(),
  ),
  myDisputeVotes: v.array(
    v.object({
      disputeId: v.id("quizSlopDisputes"),
      choice: v.union(v.literal("UPHOLD"), v.literal("VOID")),
    }),
  ),
});
