import { v } from "convex/values";
import {
  quizslopAnswerAuthorityValidator,
  quizslopContentSourceValidator,
  quizslopDefenseKindValidator,
  quizslopPackStatusValidator,
  quizslopPhaseValidator,
  quizslopRoleValidator,
} from "./quizslopValidators";

const playerRefValidator = v.object({ playerId: v.id("players"), name: v.string() });
const topicValidator = v.object({
  label: v.string(),
});
const questionValidator = v.object({
  assignmentId: v.id("quizSlopAssignments"),
  candidate: playerRefValidator,
  topic: topicValidator,
  displayPrompt: v.string(),
  choices: v.array(v.string()),
});
const pairingValidator = v.object({
  assignmentId: v.id("quizSlopAssignments"),
  candidate: playerRefValidator,
  proxy: playerRefValidator,
  authority: quizslopAnswerAuthorityValidator,
  topic: topicValidator,
});
const receiptValidator = v.object({
  assignmentId: v.id("quizSlopAssignments"),
  candidate: playerRefValidator,
  proxy: playerRefValidator,
  authority: quizslopAnswerAuthorityValidator,
  topic: topicValidator,
  displayPrompt: v.string(),
  choices: v.array(v.string()),
  scratchSelectedIndex: v.union(v.number(), v.null()),
  officialSelectedIndex: v.union(v.number(), v.null()),
  correctIndex: v.number(),
  scratchCorrect: v.boolean(),
  officialCorrect: v.boolean(),
  explanation: v.string(),
  defenses: v.array(
    v.object({
      player: playerRefValidator,
      kind: quizslopDefenseKindValidator,
      text: v.string(),
    }),
  ),
});
const finalValidator = v.union(
  v.object({
    rawCorrect: v.number(),
    sabotagePoints: v.number(),
    adjustedCorrect: v.number(),
    passed: v.boolean(),
    saboteur: playerRefValidator,
    saboteurIdentified: v.boolean(),
  }),
  v.null(),
);

const sharedFields = {
  roomCode: v.string(),
  phase: quizslopPhaseValidator,
  version: v.number(),
  phaseDeadline: v.union(v.string(), v.null()),
  serverNow: v.string(),
  timersDisabled: v.boolean(),
  sectionNumber: v.number(),
  totalSections: v.number(),
  passPercent: v.number(),
  content: v.object({
    source: quizslopContentSourceValidator,
    packStatus: quizslopPackStatusValidator,
    generatorModelName: v.union(v.string(), v.null()),
  }),
  teamScore: v.object({
    rawCorrect: v.number(),
    attempted: v.number(),
    totalQuestions: v.number(),
    integrityAdjustmentSealed: v.boolean(),
  }),
  roster: v.array(
    v.object({
      playerId: v.id("players"),
      name: v.string(),
      seatOrder: v.number(),
      connected: v.boolean(),
      suspendedThisSection: v.boolean(),
    }),
  ),
  pairings: v.array(pairingValidator),
  receipts: v.array(receiptValidator),
  submissionProgress: v.union(v.object({ resolved: v.number(), total: v.number() }), v.null()),
  reviewResult: v.union(
    v.object({
      suspendedPlayer: v.union(playerRefValidator, v.null()),
      votesCast: v.number(),
      votersTotal: v.number(),
    }),
    v.null(),
  ),
  final: finalValidator,
};

export const stageViewValidator = v.object({
  ...sharedFields,
  me: v.object({
    isHost: v.boolean(),
    playerId: v.union(v.id("players"), v.null()),
  }),
  lobby: v.union(
    v.object({
      canStart: v.boolean(),
    }),
    v.null(),
  ),
});

const privateAssignmentValidator = v.object({
  ...questionValidator.fields,
  selectedIndex: v.union(v.number(), v.null()),
  locked: v.boolean(),
});

export const controllerViewValidator = v.object({
  ...sharedFields,
  me: v.object({
    isHost: v.boolean(),
    playerId: v.union(v.id("players"), v.null()),
    name: v.union(v.string(), v.null()),
    role: v.union(quizslopRoleValidator, v.null()),
  }),
  lobby: v.union(
    v.object({
      canStart: v.boolean(),
    }),
    v.null(),
  ),
  candidateAssignment: v.union(privateAssignmentValidator, v.null()),
  proxyAssignment: v.union(privateAssignmentValidator, v.null()),
  groupVoteAssignment: v.union(privateAssignmentValidator, v.null()),
  defenses: v.array(
    v.object({
      assignmentId: v.id("quizSlopAssignments"),
      kind: quizslopDefenseKindValidator,
      candidate: playerRefValidator,
      proxy: playerRefValidator,
      displayPrompt: v.string(),
      submittedText: v.union(v.string(), v.null()),
      locked: v.boolean(),
    }),
  ),
  suspensionVote: v.union(
    v.object({
      targets: v.array(playerRefValidator),
      selectedTargetId: v.union(v.id("players"), v.null()),
      abstained: v.boolean(),
      locked: v.boolean(),
    }),
    v.null(),
  ),
  finalAccusation: v.union(
    v.object({
      targets: v.array(playerRefValidator),
      selectedTargetId: v.union(v.id("players"), v.null()),
      locked: v.boolean(),
    }),
    v.null(),
  ),
});
