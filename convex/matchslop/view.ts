import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isForfeit, loadCurrentRound } from "../rounds";
import { loadMessages, loadState, openerPromptText, tallyRound, type MatchslopPhase } from "./mode";
import { pickWinner, verdictOf } from "../../src/games/matchslop/rules";

/**
 * Everything a MatchSlop screen needs. Who wrote what stays secret until the
 * room has sent its message; while voting, each player sees only their own.
 */
export async function matchslopView(
  ctx: QueryCtx,
  game: Doc<"games">,
  viewerId: Id<"players"> | null,
  /** Every player in the game, as the room view loaded them. */
  allPlayers: Promise<Doc<"players">[]>,
) {
  const [state, messages, bundle, players] = await Promise.all([
    loadState(ctx, game._id),
    loadMessages(ctx, game._id),
    loadCurrentRound(ctx, game, { includeVotes: game.phase !== "WRITING" }),
    allPlayers,
  ]);
  const phase = game.phase as MatchslopPhase | "LOBBY" | "FINAL";
  const revealed = phase === "SENT" || phase === "REPLY" || phase === "FINAL";
  const prompt = bundle?.prompts[0];

  let round = null;
  if (bundle && prompt) {
    const tally = tallyRound(bundle, players);
    const winner = revealed ? pickWinner(tally) : null;
    const mine = bundle.responses.find((response) => response.playerId === viewerId);
    round = {
      number: bundle.round.roundNumber,
      promptId: prompt._id,
      promptText: prompt.text,
      /** Who writes this round: the seats at its start. Late joiners only vote. */
      writerIds: prompt.assigneeIds,
      /** Assignees who have answered, forfeits included. */
      answeredPlayerIds: bundle.responses.map((response) => response.playerId),
      votedPlayerIds: bundle.votes.map((vote) => vote.voterId),
      myResponseId: mine?._id ?? null,
      myVoteResponseId: bundle.votes.find((vote) => vote.voterId === viewerId)?.responseId ?? null,
      /** The ballot, sorted by id so stage and phones share one order. */
      answers:
        phase === "WRITING"
          ? []
          : tally
              .toSorted((left, right) => left.id.localeCompare(right.id))
              .map((entry) => ({
                id: entry.response._id,
                text: entry.response.text,
                openerPromptText: openerPromptText(state.profile, entry.response.openerPromptId),
                playerId:
                  revealed || entry.response.playerId === viewerId ? entry.response.playerId : null,
                weightedVotes: revealed ? entry.weightedVotes : 0,
                rawVotes: revealed ? entry.rawVotes : 0,
                pointsEarned: revealed ? entry.response.pointsEarned : 0,
                /** Who picked this line, in voting order; empty until revealed. */
                voterIds: revealed ? entry.voterIds : [],
              })),
      forfeitedPlayerIds: bundle.responses.filter(isForfeit).map((response) => response.playerId),
      winnerResponseId: winner?.response._id ?? null,
    };
  }

  return {
    kind: "MATCHSLOP" as const,
    persona: {
      seekerIdentity: state.seekerIdentity,
      personaIdentity: state.personaIdentity,
      modelId: state.personaModelId,
      profile: state.profile ?? null,
      portraitUrl: state.portrait?.status === "READY" ? (state.portrait.url ?? null) : null,
    },
    mood: state.mood,
    outcome: state.outcome,
    /** How the date ended: null while it is still going. */
    verdict: verdictOf(state),
    /** The room is on its one last shot after the persona unmatched. */
    comeback: game.status === "PLAYING" && state.comebackRound === game.round,
    /** What the latest reply did: its level, mood delta and the author's points. */
    signal: state.signal ?? null,
    messages: messages.map((message) => ({
      id: message._id,
      turn: message.turn,
      speaker: message.speaker,
      text: message.text,
      authorName: message.authorName ?? null,
      openerPromptText: message.openerPromptText ?? null,
      mood: message.mood ?? null,
      outcome: message.outcome ?? null,
      level: message.level ?? null,
    })),
    round,
    postMortem:
      game.status === "FINISHED"
        ? { pending: state.postMortem === undefined, value: state.postMortem ?? null }
        : null,
  };
}

export type MatchslopView = Awaited<ReturnType<typeof matchslopView>>;
