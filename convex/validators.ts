import { v } from "convex/values";

export const gameTypeValidator = v.union(
  v.literal("SLOPLASH"),
  v.literal("AI_CHAT_SHOWDOWN"),
  v.literal("MATCHSLOP"),
);

export const gameStatusValidator = v.union(
  v.literal("LOBBY"),
  v.literal("WRITING"),
  v.literal("VOTING"),
  v.literal("ROUND_RESULTS"),
  v.literal("FINAL_RESULTS"),
);

export const playerTypeValidator = v.union(
  v.literal("HUMAN"),
  v.literal("AI"),
  v.literal("SPECTATOR"),
);

export const participationStatusValidator = v.union(v.literal("ACTIVE"), v.literal("DISCONNECTED"));

export const sessionRoleValidator = v.union(
  v.literal("HOST"),
  v.literal("PLAYER"),
  v.literal("SPECTATOR"),
);

export const ttsModeValidator = v.union(v.literal("OFF"), v.literal("ON"));

export const matchSlopIdentityValidator = v.union(
  v.literal("MAN"),
  v.literal("WOMAN"),
  v.literal("NON_BINARY"),
  v.literal("OTHER"),
);

export const matchSlopOutcomeValidator = v.union(
  v.literal("IN_PROGRESS"),
  v.literal("DATE_SEALED"),
  v.literal("UNMATCHED"),
  v.literal("TURN_LIMIT"),
  v.literal("COMEBACK"),
);

export const matchSlopTranscriptOutcomeValidator = v.union(
  v.literal("CONTINUE"),
  v.literal("DATE_SEALED"),
  v.literal("UNMATCHED"),
  v.literal("TURN_LIMIT"),
  v.literal("COMEBACK"),
);

export const generationKindValidator = v.union(
  v.literal("RESPONSE"),
  v.literal("VOTE"),
  v.literal("CHAT_REPLY"),
  v.literal("WINNER_TAGLINE"),
  v.literal("MATCHSLOP_PROFILE"),
  v.literal("MATCHSLOP_IMAGE"),
  v.literal("MATCHSLOP_PERSONA_REPLY"),
  v.literal("MATCHSLOP_POST_MORTEM"),
);

export const generationStatusValidator = v.union(
  v.literal("QUEUED"),
  v.literal("RUNNING"),
  v.literal("SUCCEEDED"),
  v.literal("FAILED"),
  v.literal("CANCELED"),
);
