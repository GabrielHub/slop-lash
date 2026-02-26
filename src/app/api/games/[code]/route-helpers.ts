import { FORFEIT_MARKER } from "@/lib/scoring";

export function isVersionUnchanged(params: {
  clientVersion: string | null;
  ifNoneMatch: string | null;
  version: number;
}): boolean {
  const etag = `"${params.version}"`;
  return (
    (params.clientVersion !== null && Number(params.clientVersion) === params.version) ||
    params.ifNoneMatch === etag
  );
}

export function isDeadlineExpired(phaseDeadline: Date | null, nowMs = Date.now()): boolean {
  return phaseDeadline !== null && nowMs >= phaseDeadline.getTime();
}

type MutableResponse = { text: string; reactions: unknown[] };
type MutableVote = { voterId: string; voter: unknown; [key: string]: unknown };
type MutablePrompt = { id: string; responses: MutableResponse[]; votes: MutableVote[] };
type MutableRound = { prompts: MutablePrompt[] };
type MutableVotingGame = {
  status: string;
  rounds: MutableRound[];
  votingPromptIndex: number;
  votingRevealing: boolean;
};

/**
 * Strip votes from prompts that haven't been revealed yet during VOTING phase.
 * Prevents clients from peeking at partial vote results.
 */
export function stripUnrevealedVotes<T extends MutableVotingGame>(game: T): void {
  if (game.status !== "VOTING" || game.rounds[0] == null) return;

  // Must match getVotablePrompts: 2+ responses, no forfeits, sorted by id
  const votable = [...game.rounds[0].prompts]
    .filter(
      (prompt) =>
        prompt.responses.length >= 2 &&
        !prompt.responses.some((r) => r.text === FORFEIT_MARKER),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 0; i < votable.length; i++) {
    const isFuture = i > game.votingPromptIndex;
    const isCurrentUnrevealed = i === game.votingPromptIndex && !game.votingRevealing;
    if (!isFuture && !isCurrentUnrevealed) continue;

    if (isCurrentUnrevealed) {
      // Keep voter IDs so clients can show vote progress, but hide choices
      votable[i].votes = votable[i].votes.map((v) => ({
        id: "",
        voterId: v.voterId,
        responseId: null,
        failReason: null,
        voter: v.voter,
      }));
    } else {
      votable[i].votes = [];
    }
    for (const response of votable[i].responses) {
      response.reactions = [];
    }
  }
}
