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
import { taglineRow, votablePrompts } from "./mode";

export type SloplashAnswer = {
  id: Id<"responses">;
  text: string;
  forfeited: boolean;
  /** Null while authorship is still a secret. */
  playerId: Id<"players"> | null;
  /** Scored when the matchup is revealed; 0 until then. */
  pointsEarned: number;
  /** What the author lost because every human passed (0 or negative). */
  penalty: number;
  reactions: { emoji: string; playerId: Id<"players"> }[];
};

export type SloplashVote = {
  voterId: Id<"players">;
  /** Null for a pass, a timeout, or a choice that is still secret. */
  responseId: Id<"responses"> | null;
  timedOut: boolean;
  /** What the voter lost for passing on a human's matchup (0 or negative). */
  penalty: number;
};

export type SloplashPrompt = {
  id: Id<"prompts">;
  text: string;
  assigneeIds: Id<"players">[];
  /** Both players answered, so the matchup goes to a vote. */
  votable: boolean;
  /** Authors, choices, and points are visible. */
  revealed: boolean;
  answers: SloplashAnswer[];
  votes: SloplashVote[];
};

export type SloplashRound = { number: number; prompts: SloplashPrompt[] };

function mapPrompt(
  bundle: RoundBundle,
  prompt: Doc<"prompts">,
  reactions: Doc<"reactions">[],
  options: { votable: boolean; revealed: boolean; hidden: boolean; viewerId: Id<"players"> | null },
): SloplashPrompt {
  const { revealed, hidden, viewerId } = options;
  return {
    id: prompt._id,
    text: hidden ? "" : prompt.text,
    assigneeIds: prompt.assigneeIds,
    votable: options.votable,
    revealed,
    answers: hidden
      ? []
      : responsesFor(bundle, prompt._id).map((response) => ({
          id: response._id,
          text: response.text,
          forfeited: isForfeit(response),
          playerId: revealed || response.playerId === viewerId ? response.playerId : null,
          pointsEarned: revealed ? response.pointsEarned : 0,
          penalty: revealed ? (response.penalty ?? 0) : 0,
          reactions: reactions
            .filter((reaction) => reaction.responseId === response._id)
            .map((reaction) => ({ emoji: reaction.emoji, playerId: reaction.playerId })),
        })),
    votes: hidden
      ? []
      : votesFor(bundle, prompt._id).map((vote) => ({
          voterId: vote.voterId,
          responseId: revealed || vote.voterId === viewerId ? (vote.responseId ?? null) : null,
          timedOut: vote.timedOut,
          penalty: revealed ? (vote.penalty ?? 0) : 0,
        })),
  };
}

/** A finished round, fully revealed. */
async function revealedRound(ctx: QueryCtx, bundle: RoundBundle): Promise<SloplashRound> {
  const reactions = await loadRoundReactions(ctx, bundle.round._id);
  const votable = new Set(votablePrompts(bundle).map((prompt) => prompt._id));
  return {
    number: bundle.round.roundNumber,
    prompts: bundle.prompts.map((prompt) =>
      mapPrompt(bundle, prompt, reactions, {
        votable: votable.has(prompt._id),
        revealed: true,
        hidden: false,
        viewerId: null,
      }),
    ),
  };
}

/**
 * Everything a SlopLash screen needs. Secrets stay secret until the phase that
 * reveals them: other players' prompts while writing, authors and choices
 * until a matchup's reveal, and matchups that have not come up yet.
 */
export async function sloplashView(
  ctx: QueryCtx,
  game: Doc<"games">,
  viewerId: Id<"players"> | null,
) {
  const isFinal = game.status === "FINISHED";
  const [tagline, bundle, allRounds] = await Promise.all([
    taglineRow(ctx, game),
    isFinal ? null : loadCurrentRound(ctx, game),
    isFinal ? loadAllRounds(ctx, game._id) : [],
  ]);

  const base = {
    kind: "SLOPLASH" as const,
    tagline: tagline ? { playerId: tagline.playerId, text: tagline.text ?? null } : null,
    writing: null,
    currentPromptId: null,
    /** How many matchups go to a vote this round. */
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

  const reactions = await loadRoundReactions(ctx, bundle.round._id);
  const votable = votablePrompts(bundle);
  const inVoting = game.phase === "VOTING" || game.phase === "REVEAL";
  const current = inVoting ? votable[game.step] : undefined;
  const prompts = bundle.prompts.map((prompt) => {
    const order = votable.findIndex((candidate) => candidate._id === prompt._id);
    const isCurrent = order === game.step;
    return mapPrompt(bundle, prompt, reactions, {
      votable: order >= 0,
      revealed: !inVoting || order < game.step || (isCurrent && game.phase === "REVEAL"),
      hidden: inVoting && order > game.step,
      viewerId,
    });
  });
  return {
    ...base,
    round: { number: game.round, prompts },
    rounds: [],
    currentPromptId: current?._id ?? null,
    matchupCount: votable.length,
  };
}

export type SloplashView = Awaited<ReturnType<typeof sloplashView>>;
