import { v } from "convex/values";
import {
  matchSlopIdentityValidator,
  matchSlopOutcomeValidator,
  matchSlopTranscriptOutcomeValidator,
} from "./validators";

export const nullableStringValidator = v.union(v.string(), v.null());

export const matchSlopDecisionValidator = v.union(
  v.literal("CONTINUE"),
  v.literal("DATE_SEALED"),
  v.literal("UNMATCHED"),
);

export const matchSlopUsageValidator = v.object({
  modelId: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  costUsd: v.number(),
});

export const matchSlopProfilePromptValidator = v.object({
  id: v.string(),
  prompt: v.string(),
  answer: v.string(),
});

export const matchSlopProfilePromptDraftValidator = v.object({
  id: v.optional(v.string()),
  prompt: v.optional(v.string()),
  answer: v.optional(v.string()),
});

export const matchSlopPersonaDetailsValidator = v.object({
  job: nullableStringValidator,
  school: nullableStringValidator,
  height: nullableStringValidator,
  languages: v.array(v.string()),
});

export const matchSlopPersonaDetailsDraftValidator = v.object({
  job: v.optional(nullableStringValidator),
  school: v.optional(nullableStringValidator),
  height: v.optional(nullableStringValidator),
  languages: v.optional(v.array(v.string())),
});

export const matchSlopProfileValidator = v.object({
  displayName: v.string(),
  backstory: nullableStringValidator,
  appearance: v.optional(nullableStringValidator),
  age: v.union(v.number(), v.null()),
  location: nullableStringValidator,
  bio: v.string(),
  tagline: nullableStringValidator,
  prompts: v.array(matchSlopProfilePromptValidator),
  details: v.union(matchSlopPersonaDetailsValidator, v.null()),
});

export const matchSlopProfileDraftValidator = v.object({
  displayName: v.optional(v.string()),
  backstory: v.optional(nullableStringValidator),
  appearance: v.optional(nullableStringValidator),
  age: v.optional(v.union(v.number(), v.null())),
  location: v.optional(nullableStringValidator),
  bio: v.optional(nullableStringValidator),
  tagline: v.optional(nullableStringValidator),
  prompts: v.optional(v.array(matchSlopProfilePromptDraftValidator)),
  details: v.optional(v.union(matchSlopPersonaDetailsDraftValidator, v.null())),
});

export const matchSlopProfileGenerationValidator = v.object({
  status: v.union(
    v.literal("NOT_REQUESTED"),
    v.literal("STREAMING"),
    v.literal("READY"),
    v.literal("FAILED"),
  ),
  updatedAt: v.string(),
  generationId: nullableStringValidator,
});

export const matchSlopPersonaImageValidator = v.object({
  status: v.union(
    v.literal("NOT_REQUESTED"),
    v.literal("PENDING"),
    v.literal("PROCESSING"),
    v.literal("READY"),
    v.literal("FAILED"),
  ),
  imageUrl: nullableStringValidator,
  updatedAt: v.string(),
});

export const matchSlopRoundResultValidator = v.object({
  promptId: v.string(),
  winnerResponseId: v.string(),
  winnerPlayerId: v.string(),
  winnerText: v.string(),
  authorName: nullableStringValidator,
  weightedVotes: v.number(),
  rawVotes: v.number(),
  selectedPromptId: nullableStringValidator,
  selectedPromptText: nullableStringValidator,
});

export const matchSlopPendingPersonaReplyValidator = v.object({
  status: v.union(
    v.literal("NOT_REQUESTED"),
    v.literal("GENERATING"),
    v.literal("READY"),
    v.literal("FAILED"),
  ),
  reply: nullableStringValidator,
  outcome: v.union(matchSlopDecisionValidator, v.null()),
  moodDelta: v.union(v.number(), v.null()),
  generationId: nullableStringValidator,
  signalCategory: nullableStringValidator,
  sideComment: nullableStringValidator,
  nextSignal: nullableStringValidator,
});

export const matchSlopPostMortemCalloutValidator = v.object({
  playerName: v.string(),
  verdict: v.string(),
  favoriteLine: nullableStringValidator,
});

export const matchSlopPostMortemValidator = v.object({
  opening: v.string(),
  playerCallouts: v.array(matchSlopPostMortemCalloutValidator),
  favoriteMoment: v.string(),
  finalThought: v.string(),
});

export const matchSlopPostMortemCalloutDraftValidator = v.object({
  playerName: v.optional(v.string()),
  verdict: v.optional(v.string()),
  favoriteLine: v.optional(nullableStringValidator),
});

export const matchSlopPostMortemDraftValidator = v.object({
  opening: v.optional(v.string()),
  playerCallouts: v.optional(v.array(matchSlopPostMortemCalloutDraftValidator)),
  favoriteMoment: v.optional(v.string()),
  finalThought: v.optional(v.string()),
});

export const matchSlopPostMortemGenerationValidator = v.object({
  status: v.union(
    v.literal("NOT_REQUESTED"),
    v.literal("STREAMING"),
    v.literal("READY"),
    v.literal("FAILED"),
  ),
  updatedAt: v.string(),
  generationId: nullableStringValidator,
});

export const matchSlopTranscriptEntryValidator = v.object({
  id: v.id("matchSlopTranscriptEntries"),
  speaker: v.union(v.literal("PLAYERS"), v.literal("PERSONA")),
  text: v.string(),
  turn: v.number(),
  outcome: v.union(matchSlopTranscriptOutcomeValidator, v.null()),
  authorName: nullableStringValidator,
  selectedPromptText: nullableStringValidator,
  selectedPromptId: nullableStringValidator,
  mood: v.union(v.number(), v.null()),
});

export const matchSlopModeStateValidator = v.object({
  seekerIdentity: matchSlopIdentityValidator,
  personaIdentity: matchSlopIdentityValidator,
  outcome: matchSlopOutcomeValidator,
  humanVoteWeight: v.number(),
  aiVoteWeight: v.number(),
  selectedPersonaExampleIds: v.array(v.string()),
  selectedPlayerExamples: v.array(v.string()),
  comebackRound: v.union(v.number(), v.null()),
  transcript: v.array(matchSlopTranscriptEntryValidator),
  profileDraft: v.union(matchSlopProfileDraftValidator, v.null()),
  profileGeneration: v.union(matchSlopProfileGenerationValidator, v.null()),
  profile: v.union(matchSlopProfileValidator, v.null()),
  personaImage: v.union(matchSlopPersonaImageValidator, v.null()),
  lastRoundResult: v.union(matchSlopRoundResultValidator, v.null()),
  mood: v.number(),
  pendingPersonaReply: v.union(matchSlopPendingPersonaReplyValidator, v.null()),
  latestSignalCategory: nullableStringValidator,
  latestSideComment: nullableStringValidator,
  latestNextSignal: nullableStringValidator,
  latestMoodDelta: v.union(v.number(), v.null()),
  postMortemGeneration: v.union(matchSlopPostMortemGenerationValidator, v.null()),
  postMortemDraft: v.union(matchSlopPostMortemDraftValidator, v.null()),
  postMortem: v.union(matchSlopPostMortemValidator, v.null()),
});

export const gameModeStateValidator = v.union(matchSlopModeStateValidator, v.null());

export const matchSlopPersonaSeedValidator = v.object({
  id: v.string(),
  name: v.string(),
  identity: matchSlopIdentityValidator,
  backstory: v.string(),
  textingStyle: v.string(),
  title: v.string(),
  bio: v.string(),
  details: matchSlopPersonaDetailsValidator,
  appearance: v.string(),
  imagePrompt: v.string(),
  promptExamples: v.array(v.string()),
  toneTags: v.array(v.string()),
  redFlags: v.array(v.string()),
  greenFlags: v.array(v.string()),
});

const staleContextValidator = v.object({ kind: v.literal("stale"), reason: v.string() });
const transcriptContextEntryValidator = v.object({
  speaker: v.union(v.literal("PLAYERS"), v.literal("PERSONA")),
  text: v.string(),
  authorName: nullableStringValidator,
});

export const matchSlopProfileReadyContextValidator = v.object({
  kind: v.literal("ready"),
  modelId: v.string(),
  seekerIdentity: matchSlopIdentityValidator,
  personaIdentity: matchSlopIdentityValidator,
  personaExamples: v.array(matchSlopPersonaSeedValidator),
});
export const matchSlopProfileContextValidator = v.union(
  staleContextValidator,
  matchSlopProfileReadyContextValidator,
);

export const matchSlopImageReadyContextValidator = v.object({
  kind: v.literal("ready"),
  modelId: v.string(),
  personaIdentity: matchSlopIdentityValidator,
  profile: matchSlopProfileValidator,
  personaExamples: v.array(matchSlopPersonaSeedValidator),
});
export const matchSlopImageContextValidator = v.union(
  staleContextValidator,
  matchSlopImageReadyContextValidator,
);

export const matchSlopResponseReadyContextValidator = v.object({
  kind: v.literal("ready"),
  modelId: v.string(),
  currentRound: v.number(),
  profile: matchSlopProfileValidator,
  examples: v.array(v.string()),
  conversationContext: v.string(),
  timeoutMs: v.union(v.number(), v.null()),
});
export const matchSlopResponseContextValidator = v.union(
  staleContextValidator,
  matchSlopResponseReadyContextValidator,
);

export const matchSlopVoteReadyContextValidator = v.object({
  kind: v.literal("ready"),
  modelId: v.string(),
  conversationContext: v.string(),
  seedKey: v.string(),
  timeoutMs: v.union(v.number(), v.null()),
  responses: v.array(v.object({ id: v.string(), text: v.string() })),
});
export const matchSlopVoteContextValidator = v.union(
  staleContextValidator,
  matchSlopVoteReadyContextValidator,
);

export const matchSlopReplyReadyContextValidator = v.object({
  kind: v.literal("ready"),
  modelId: v.string(),
  seekerIdentity: matchSlopIdentityValidator,
  personaIdentity: matchSlopIdentityValidator,
  profile: matchSlopProfileValidator,
  currentMood: v.number(),
  forceContinue: v.boolean(),
  transcript: v.array(transcriptContextEntryValidator),
});
export const matchSlopReplyContextValidator = v.union(
  staleContextValidator,
  matchSlopReplyReadyContextValidator,
);

export const matchSlopPostMortemReadyContextValidator = v.object({
  kind: v.literal("ready"),
  modelId: v.string(),
  personaIdentity: matchSlopIdentityValidator,
  profile: matchSlopProfileValidator,
  outcome: matchSlopOutcomeValidator,
  playerNames: v.array(v.string()),
  transcript: v.array(transcriptContextEntryValidator),
});
export const matchSlopPostMortemContextValidator = v.union(
  staleContextValidator,
  matchSlopPostMortemReadyContextValidator,
);

export const matchSlopPersistResultValidator = v.object({
  status: v.union(v.literal("CANCELED"), v.literal("DUPLICATE"), v.literal("SUCCEEDED")),
});
