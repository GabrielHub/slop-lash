import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getQuizslopState, isQuizslopGame } from "./quizslopData";
import { selectVoiceLineId } from "../src/games/quizslop/voice";
import type { QuizslopPhase, QuizslopVoiceEventTag } from "../src/games/quizslop/types";
import { SHARED_STATUS_BY_PHASE } from "../src/games/quizslop/types";
import { QUIZSLOP_VOICE_LINES } from "../src/games/quizslop/config/voice-lines";

const enforceQuizslopDeadlineRef = makeFunctionReference<
  "mutation",
  { gameId: Id<"games">; deadline: number; phaseGeneration: number },
  { advanced: boolean }
>("quizslop:enforceDeadline");

export type QuizslopEngineBundle = {
  game: Doc<"games">;
  state: Doc<"quizSlopState">;
};

export async function loadQuizslopBundle(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<QuizslopEngineBundle | null> {
  const game = await ctx.db.get("games", gameId);
  if (!game || !isQuizslopGame(game)) return null;
  const state = await getQuizslopState(ctx, gameId);
  return { game, state };
}

export function isTerminalQuizslopPhase(phase: QuizslopPhase): boolean {
  return phase === "FINAL_RESULTS" || phase === "ABANDONED";
}

// TOPIC_REVEAL's tag depends on the round kind, so it is resolved separately;
// every other phase maps to a fixed tag (ABANDONED shares the FINAL_RESULTS tag).
const VOICE_TAG_BY_PHASE: Record<
  Exclude<QuizslopPhase, "TOPIC_REVEAL">,
  QuizslopVoiceEventTag
> = {
  LOBBY_SETUP: "LOBBY_SETUP",
  HOUSE_VOTE: "HOUSE_VOTE",
  HOUSE_VOTE_REVEAL: "HOUSE_VOTE_REVEAL",
  SLOP_CALL: "SLOP_CALL",
  SLOP_CALL_REVEAL: "SLOP_CALL_REVEAL",
  ANSWER: "ANSWER",
  QUESTION_REVEAL: "QUESTION_REVEAL",
  DISPUTE_WINDOW: "DISPUTE_WINDOW",
  DISPUTE_VOTE: "DISPUTE_VOTE",
  ROUND_RESULTS: "ROUND_RESULTS",
  CONTINUITY_GRACE: "CONTINUITY_GRACE",
  FINAL_RESULTS: "FINAL_RESULTS",
  ABANDONED: "FINAL_RESULTS",
};

function voiceTagForPhase(
  phase: QuizslopPhase,
  roundKind: Doc<"quizSlopRounds">["kind"] | null,
): QuizslopVoiceEventTag {
  if (phase === "TOPIC_REVEAL") {
    if (roundKind === "HOME_TURF") return "TOPIC_REVEAL_HOME_TURF";
    if (roundKind === "HOUSE_CHOICE") return "TOPIC_REVEAL_HOUSE_CHOICE";
    return "TOPIC_REVEAL_WARM_UP";
  }
  return VOICE_TAG_BY_PHASE[phase];
}

/**
 * The single phase-transition writer. It persists the shared and mode-specific
 * state, keeps the in-transaction bundle coherent, and schedules the guarded
 * deadline only after both records have advanced to the same generation.
 */
export async function transitionQuizslopPhase(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  next: {
    phase: QuizslopPhase;
    now: number;
    deadlineSeconds: number | null;
    deadlineIgnoresTimersDisabled?: boolean;
    revealOrdinal?: number;
    deckPosition?: number;
    currentRound?: number;
    roundKind?: Doc<"quizSlopRounds">["kind"] | null;
  },
): Promise<void> {
  const { game, state } = bundle;
  const nextGeneration = game.phaseGeneration + 1;
  const timersApply = !game.timersDisabled || next.deadlineIgnoresTimersDisabled === true;
  const deadline =
    next.deadlineSeconds !== null && timersApply
      ? next.now + next.deadlineSeconds * 1_000
      : undefined;
  const terminal = isTerminalQuizslopPhase(next.phase);
  const tag = voiceTagForPhase(next.phase, next.roundKind ?? null);
  const eligibleLineIds = QUIZSLOP_VOICE_LINES.filter(
    (line) => line.tag === tag && line.review.approved,
  ).map((line) => line.id);
  const selectedVoiceLineId = selectVoiceLineId(
    eligibleLineIds,
    `${game._id}:${nextGeneration}:${tag}`,
    state.selectedVoiceLineId ?? null,
  );

  const gamePatch = {
    status: SHARED_STATUS_BY_PHASE[next.phase],
    phaseGeneration: nextGeneration,
    phaseDeadline: deadline,
    ...(next.currentRound !== undefined ? { currentRound: next.currentRound } : {}),
    ...(terminal && game.finalizedAt === undefined ? { finalizedAt: next.now } : {}),
    updatedAt: next.now,
  };
  const statePatch = {
    phase: next.phase,
    revealOrdinal: next.revealOrdinal ?? 0,
    ...(next.deckPosition !== undefined ? { deckPosition: next.deckPosition } : {}),
    ...(terminal
      ? { outcome: next.phase === "ABANDONED" ? ("ABANDONED" as const) : ("COMPLETED" as const) }
      : {}),
    previousVoiceLineId: state.selectedVoiceLineId,
    selectedVoiceLineId: selectedVoiceLineId ?? undefined,
    updatedAt: next.now,
  };
  await ctx.db.patch("games", game._id, gamePatch);
  await ctx.db.patch("quizSlopState", state._id, statePatch);

  bundle.game = { ...game, ...gamePatch };
  bundle.state = { ...state, ...statePatch };

  if (deadline !== undefined) {
    await ctx.scheduler.runAt(deadline, enforceQuizslopDeadlineRef, {
      gameId: game._id,
      deadline,
      phaseGeneration: nextGeneration,
    });
  }
}
