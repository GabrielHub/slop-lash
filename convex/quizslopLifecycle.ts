import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getQuizslopState, isQuizslopGame } from "./quizslopData";
import type { QuizslopPhase } from "../src/games/quizslop/types";
import { SHARED_STATUS_BY_PHASE } from "../src/games/quizslop/types";

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
  return { game, state: await getQuizslopState(ctx, gameId) };
}

function isTerminalQuizslopPhase(phase: QuizslopPhase): boolean {
  return phase === "FINAL_RESULTS";
}

/** Single writer for synchronized shared/mode phase state and guarded deadlines. */
export async function transitionQuizslopPhase(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  next: {
    phase: QuizslopPhase;
    now: number;
    deadlineSeconds: number | null;
    deckPosition?: number;
    currentRound?: number;
  },
): Promise<void> {
  const nextGeneration = bundle.game.phaseGeneration + 1;
  const timersApply = !bundle.game.timersDisabled;
  const deadline =
    next.deadlineSeconds !== null && timersApply
      ? next.now + next.deadlineSeconds * 1_000
      : undefined;
  const terminal = isTerminalQuizslopPhase(next.phase);
  const gamePatch = {
    status: SHARED_STATUS_BY_PHASE[next.phase],
    phaseGeneration: nextGeneration,
    phaseDeadline: deadline,
    ...(next.currentRound !== undefined ? { currentRound: next.currentRound } : {}),
    ...(terminal && bundle.game.finalizedAt === undefined ? { finalizedAt: next.now } : {}),
    updatedAt: next.now,
  };
  const statePatch = {
    phase: next.phase,
    ...(next.deckPosition !== undefined ? { deckPosition: next.deckPosition } : {}),
  };
  await ctx.db.patch("games", bundle.game._id, gamePatch);
  await ctx.db.patch("quizSlopState", bundle.state._id, statePatch);
  bundle.game = { ...bundle.game, ...gamePatch };
  bundle.state = { ...bundle.state, ...statePatch };

  if (deadline !== undefined) {
    await ctx.scheduler.runAt(deadline, enforceQuizslopDeadlineRef, {
      gameId: bundle.game._id,
      deadline,
      phaseGeneration: nextGeneration,
    });
  }
}
