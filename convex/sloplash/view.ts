import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  isForfeit,
  loadAllRounds,
  loadCurrentRound,
  loadRoundReactions,
  responsesFor,
  votesFor,
  type RoundBundle,
} from "../rounds";
import { matchupOrder, matchupStage, taglineRow, type Matchup } from "./mode";
import { presentationOrder } from "../../src/games/sloplash/order";
import type { MatchupKind } from "../../src/games/sloplash/scoring";

export type SloplashAnswer = {
  id: Id<"responses">;
  text: string;
  forfeited: boolean;
  /** Null while authorship is still a secret (the viewer always sees their own). */
  playerId: Id<"players"> | null;
  /** Scored when the matchup is revealed; 0 until then. */
  pointsEarned: number;
  /** Every reaction, AI included; empty until the matchup is revealed. */
  reactions: { emoji: string; playerId: Id<"players"> }[];
};

export type SloplashVote = {
  voterId: Id<"players">;
  /**
   * The picked answer. Null for an abstain or a timeout, and while the choice
   * is still a secret (the viewer always sees their own). "Cast" means non-null
   * once revealed.
   */
  responseId: Id<"responses"> | null;
  /** A human ran out the clock. AI failures abstain without timing out. */
  timedOut: boolean;
};

/** A human reaction sent while the matchup is being voted on; anonymous. */
export type SloplashLiveReaction = {
  id: Id<"reactions">;
  emoji: string;
  /** The viewer sent it, so a phone's sent reactions survive a reload. */
  mine: boolean;
};

export type SloplashPrompt = {
  id: Id<"prompts">;
  /** Empty for a matchup that has not come up yet. */
  text: string;
  assigneeIds: Id<"players">[];
  /** `vote` (two answers), `walkover` (one answer) or `void` (none, never shown). */
  kind: MatchupKind;
  /** Position in the round's play order (`room.step` indexes it); null for a void. */
  order: number | null;
  /** Authors, choices, points and reactions are visible. */
  revealed: boolean;
  /** In a stable per-prompt shuffle (not creation order), so position never hints at authorship. */
  answers: SloplashAnswer[];
  votes: SloplashVote[];
  /** Human reactions on the matchup being voted on; empty everywhere else. */
  liveReactions: SloplashLiveReaction[];
};

export type SloplashRound = { number: number; prompts: SloplashPrompt[] };

type PromptState = {
  kind: MatchupKind;
  order: number | null;
  revealed: boolean;
  /** A matchup that has not come up yet: only its kind, order and assignees show. */
  hidden: boolean;
  /** The matchup being voted on right now. */
  live: boolean;
  viewerId: Id<"players"> | null;
};

/** Play order and kind for every prompt in a round (voids get no order). */
function promptOrder(matchups: readonly Matchup[]) {
  const order = new Map<Id<"prompts">, { kind: "vote" | "walkover"; order: number }>();
  for (const [index, matchup] of matchups.entries()) {
    order.set(matchup.prompt._id, { kind: matchup.kind, order: index });
  }
  return order;
}

function mapPrompt(
  bundle: RoundBundle,
  prompt: Doc<"prompts">,
  reactions: Doc<"reactions">[],
  aiPlayerIds: ReadonlySet<Id<"players">>,
  state: PromptState,
): SloplashPrompt {
  const { revealed, hidden, live, viewerId } = state;
  const base = {
    id: prompt._id,
    assigneeIds: prompt.assigneeIds,
    kind: state.kind,
    order: state.order,
    revealed,
  };
  if (hidden) return { ...base, text: "", answers: [], votes: [], liveReactions: [] };

  // A stable per-prompt shuffle, so the left card never hints at who wrote it.
  const responses = presentationOrder(prompt._id, responsesFor(bundle, prompt._id));
  const responseIds = new Set(responses.map((response) => response._id));
  const promptReactions = reactions.filter((reaction) => responseIds.has(reaction.responseId));
  return {
    ...base,
    text: prompt.text,
    answers: responses.map((response) => ({
      id: response._id,
      text: response.text,
      forfeited: isForfeit(response),
      playerId: revealed || response.playerId === viewerId ? response.playerId : null,
      pointsEarned: revealed ? response.pointsEarned : 0,
      reactions: revealed
        ? promptReactions
            .filter((reaction) => reaction.responseId === response._id)
            .map((reaction) => ({ emoji: reaction.emoji, playerId: reaction.playerId }))
        : [],
    })),
    votes: votesFor(bundle, prompt._id).map((vote) => ({
      voterId: vote.voterId,
      responseId: revealed || vote.voterId === viewerId ? (vote.responseId ?? null) : null,
      timedOut: vote.timedOut,
    })),
    // AI reactions stay hidden until the reveal, so they never anchor human voters.
    liveReactions: live
      ? promptReactions
          .filter((reaction) => !aiPlayerIds.has(reaction.playerId))
          .map((reaction) => ({
            id: reaction._id,
            emoji: reaction.emoji,
            mine: reaction.playerId === viewerId,
          }))
      : [],
  };
}

/** A finished round, fully revealed. */
async function revealedRound(ctx: QueryCtx, bundle: RoundBundle): Promise<SloplashRound> {
  const reactions = await loadRoundReactions(ctx, bundle.round._id);
  const order = promptOrder(matchupOrder(bundle));
  return {
    number: bundle.round.roundNumber,
    prompts: bundle.prompts.map((prompt) =>
      mapPrompt(bundle, prompt, reactions, new Set(), {
        kind: order.get(prompt._id)?.kind ?? "void",
        order: order.get(prompt._id)?.order ?? null,
        revealed: true,
        hidden: false,
        live: false,
        viewerId: null,
      }),
    ),
  };
}

/**
 * Everything a SlopLash screen needs. Secrets stay secret until the phase that
 * reveals them: other players' prompts while writing, authors and choices
 * until a matchup's reveal, and matchups that have not come up yet. Staged AI
 * ballots live in their own table and never reach a view.
 */
export async function sloplashView(
  ctx: QueryCtx,
  game: Doc<"games">,
  viewerId: Id<"players"> | null,
  /** Every player in the game, as the room view loaded them. */
  allPlayers: Promise<Doc<"players">[]>,
) {
  const isFinal = game.status === "FINISHED";
  const [tagline, bundle, allRounds] = await Promise.all([
    taglineRow(ctx, game),
    isFinal ? null : loadCurrentRound(ctx, game),
    isFinal ? loadAllRounds(ctx, game._id) : [],
  ]);

  const base = {
    kind: "SLOPLASH" as const,
    /** The leading AI's line; `text` is null while it is being written. */
    tagline: tagline ? { playerId: tagline.playerId, text: tagline.text ?? null } : null,
    writing: null,
    currentPromptId: null,
    /** How many matchups the round plays (walkovers and votes; voids excluded). */
    matchupCount: 0,
  };

  if (isFinal) {
    const rounds = await Promise.all(allRounds.map((round) => revealedRound(ctx, round)));
    return { ...base, round: rounds.at(-1) ?? null, rounds };
  }
  if (!bundle) return { ...base, round: null, rounds: [] };

  if (game.phase === "WRITING") {
    const done = new Set<string>();
    const pending = new Set<string>();
    for (const prompt of bundle.prompts) {
      const answered = new Set(responsesFor(bundle, prompt._id).map((r) => r.playerId as string));
      for (const id of prompt.assigneeIds) (answered.has(id) ? done : pending).add(id);
    }
    return {
      ...base,
      round: { number: game.round, prompts: [] },
      rounds: [],
      writing: {
        prompts: bundle.prompts
          .filter((prompt) => viewerId !== null && prompt.assigneeIds.includes(viewerId))
          .map((prompt) => ({
            id: prompt._id,
            text: prompt.text,
            submitted: responsesFor(bundle, prompt._id).some((r) => r.playerId === viewerId),
          })),
        /** Players who have answered every prompt they were given. */
        finishedPlayerIds: [...done].filter((id) => !pending.has(id)) as Id<"players">[],
      },
    };
  }

  const [reactions, players] = await Promise.all([
    loadRoundReactions(ctx, bundle.round._id),
    allPlayers,
  ]);
  const aiPlayerIds = new Set(
    players.filter((player) => player.type === "AI").map((player) => player._id),
  );
  const matchups = matchupOrder(bundle);
  const order = promptOrder(matchups);
  const inMatchups = game.phase === "VOTING" || game.phase === "REVEAL";
  const current = inMatchups ? matchups[game.step] : undefined;
  const prompts = bundle.prompts.map((prompt) => {
    const placed = order.get(prompt._id);
    const position = placed?.order ?? null;
    // Outside VOTING and REVEAL (and for voids) every matchup is settled.
    const stage = inMatchups && position !== null ? matchupStage(game, position) : "past";
    return mapPrompt(bundle, prompt, reactions, aiPlayerIds, {
      kind: placed?.kind ?? "void",
      order: position,
      revealed: stage === "past",
      hidden: stage === "future",
      live: stage === "live",
      viewerId,
    });
  });
  return {
    ...base,
    round: { number: game.round, prompts },
    rounds: [],
    currentPromptId: current?.prompt._id ?? null,
    matchupCount: matchups.length,
  };
}

export type SloplashView = Awaited<ReturnType<typeof sloplashView>>;
