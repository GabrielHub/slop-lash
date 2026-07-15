import { v } from "convex/values";
import {
  gameStatusValidator,
  gameTypeValidator,
  matchSlopIdentityValidator,
  matchSlopOutcomeValidator,
  participationStatusValidator,
  playerTypeValidator,
  sessionRoleValidator,
  ttsModeValidator,
} from "./validators";
import {
  gameModeStateValidator,
  matchSlopProfilePromptValidator,
  matchSlopTranscriptEntryValidator,
  nullableStringValidator,
} from "./matchslopValidators";

const publicPlayerValidator = v.object({
  humorRating: v.number(),
  id: v.id("players"),
  idleRounds: v.number(),
  lastSeen: v.string(),
  modelId: nullableStringValidator,
  name: v.string(),
  participationStatus: participationStatusValidator,
  score: v.number(),
  type: playerTypeValidator,
  winStreak: v.number(),
});

const responsePlayerValidator = v.object({
  humorRating: v.number(),
  id: v.string(),
  idleRounds: v.number(),
  lastSeen: v.string(),
  modelId: nullableStringValidator,
  name: v.string(),
  participationStatus: participationStatusValidator,
  type: playerTypeValidator,
  winStreak: v.number(),
});

const stageRoundValidator = v.object({
  gameId: v.id("games"),
  id: v.id("rounds"),
  prompts: v.array(
    v.object({
      assignments: v.array(v.object({ promptId: v.id("prompts"), playerId: v.id("players") })),
      id: v.id("prompts"),
      responses: v.array(
        v.object({
          failReason: nullableStringValidator,
          id: v.id("responses"),
          metadata: v.union(v.record(v.string(), v.any()), v.null()),
          player: responsePlayerValidator,
          playerId: v.string(),
          pointsEarned: v.number(),
          promptId: v.id("prompts"),
          reactions: v.array(
            v.object({
              emoji: v.string(),
              id: v.id("reactions"),
              playerId: v.id("players"),
              responseId: v.id("responses"),
            }),
          ),
          text: v.string(),
        }),
      ),
      roundId: v.id("rounds"),
      text: v.string(),
      votes: v.array(
        v.object({
          failReason: nullableStringValidator,
          id: v.string(),
          promptId: v.id("prompts"),
          responseId: v.union(v.id("responses"), v.null()),
          voter: v.object({ id: v.id("players"), type: playerTypeValidator }),
          voterId: v.id("players"),
        }),
      ),
    }),
  ),
  roundNumber: v.number(),
});

const viewerValidator = v.object({
  isHost: v.boolean(),
  playerId: v.union(v.id("players"), v.null()),
  role: sessionRoleValidator,
  sessionId: v.id("playerSessions"),
});

const modelUsageValidator = v.object({
  costUsd: v.number(),
  inputTokens: v.number(),
  modelId: v.string(),
  outputTokens: v.number(),
});

const stageViewFields = {
  aiCostUsd: v.number(),
  aiInputTokens: v.number(),
  aiOutputTokens: v.number(),
  currentRound: v.number(),
  gameType: gameTypeValidator,
  hostPlayerId: v.union(v.id("players"), v.null()),
  id: v.id("games"),
  me: viewerValidator,
  modeState: gameModeStateValidator,
  modelUsages: v.array(modelUsageValidator),
  nextGameCode: nullableStringValidator,
  personaModelId: nullableStringValidator,
  phaseDeadline: nullableStringValidator,
  players: v.array(publicPlayerValidator),
  roomCode: v.string(),
  rounds: v.array(stageRoundValidator),
  status: gameStatusValidator,
  timersDisabled: v.boolean(),
  totalRounds: v.number(),
  ttsMode: ttsModeValidator,
  ttsVoice: v.string(),
  version: v.number(),
  votingPromptIndex: v.number(),
  votingRevealing: v.boolean(),
  winnerTagline: nullableStringValidator,
  winnerTaglinePending: v.boolean(),
};

export const lobbyViewValidator = v.object(stageViewFields);
export const stageViewValidator = v.object({ ...stageViewFields, serverNow: v.string() });

const controllerPlayerValidator = v.object({
  id: v.id("players"),
  name: v.string(),
  participationStatus: participationStatusValidator,
  type: playerTypeValidator,
});
const progressValidator = v.object({ submitted: v.number(), total: v.number() });
const voteProgressValidator = v.object({ voted: v.number(), total: v.number() });
const matchSlopControllerValidator = v.object({
  aiVoteWeight: v.number(),
  comebackRound: v.union(v.number(), v.null()),
  humanVoteWeight: v.number(),
  latestMoodDelta: v.union(v.number(), v.null()),
  latestNextSignal: nullableStringValidator,
  latestSideComment: nullableStringValidator,
  latestSignalCategory: nullableStringValidator,
  mood: v.union(v.number(), v.null()),
  outcome: matchSlopOutcomeValidator,
  personaIdentity: v.union(matchSlopIdentityValidator, v.null()),
  profile: v.union(
    v.object({
      age: v.union(v.number(), v.null()),
      bio: nullableStringValidator,
      details: v.union(
        v.object({
          height: nullableStringValidator,
          job: nullableStringValidator,
          languages: v.array(v.string()),
          school: nullableStringValidator,
        }),
        v.null(),
      ),
      displayName: v.string(),
      image: v.object({
        imageUrl: nullableStringValidator,
        status: v.union(
          v.literal("NOT_REQUESTED"),
          v.literal("PENDING"),
          v.literal("PROCESSING"),
          v.literal("READY"),
          v.literal("FAILED"),
        ),
      }),
      location: nullableStringValidator,
      prompts: v.array(matchSlopProfilePromptValidator),
      tagline: nullableStringValidator,
    }),
    v.null(),
  ),
  profileGeneration: v.object({
    status: v.union(
      v.literal("NOT_REQUESTED"),
      v.literal("STREAMING"),
      v.literal("READY"),
      v.literal("FAILED"),
    ),
    updatedAt: v.string(),
  }),
  progressCount: v.union(progressValidator, v.null()),
  seekerIdentity: v.union(matchSlopIdentityValidator, v.null()),
  transcript: v.array(matchSlopTranscriptEntryValidator),
  voteProgressCount: v.union(voteProgressValidator, v.null()),
  writing: v.union(
    v.object({
      openerOptions: v.array(matchSlopProfilePromptValidator),
      promptId: v.id("prompts"),
      submitted: v.boolean(),
      text: v.string(),
    }),
    v.null(),
  ),
});

export const controllerViewValidator = v.object({
  currentRound: v.number(),
  gameType: gameTypeValidator,
  hostPlayerId: v.union(v.id("players"), v.null()),
  id: v.id("games"),
  matchslop: v.union(matchSlopControllerValidator, v.null()),
  me: v.union(controllerPlayerValidator, v.null()),
  nextGameCode: nullableStringValidator,
  phaseDeadline: nullableStringValidator,
  players: v.array(controllerPlayerValidator),
  roomCode: v.string(),
  serverNow: v.string(),
  status: gameStatusValidator,
  timersDisabled: v.boolean(),
  totalRounds: v.number(),
  version: v.number(),
  voting: v.union(
    v.object({
      currentPrompt: v.union(
        v.object({
          forfeitCount: v.number(),
          hasAbstained: v.boolean(),
          hasVoted: v.boolean(),
          id: v.id("prompts"),
          isRespondent: v.boolean(),
          responses: v.array(
            v.object({
              id: v.id("responses"),
              openerPromptId: nullableStringValidator,
              text: v.string(),
            }),
          ),
          text: v.string(),
        }),
        v.null(),
      ),
      totalPrompts: v.number(),
    }),
    v.null(),
  ),
  votingPromptIndex: v.number(),
  votingRevealing: v.boolean(),
  writing: v.union(
    v.object({
      prompts: v.array(v.object({ id: v.id("prompts"), submitted: v.boolean(), text: v.string() })),
    }),
    v.null(),
  ),
});
