import type { GameState, GamePrompt, GamePlayer } from "@/lib/types";
import { filterCastVotes } from "@/lib/types";
import { FORFEIT_MARKER } from "./scoring";

export const NARRATOR_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Replace ______ blanks for natural voice narration:
 * - End-of-prompt blanks (only trailing punctuation after) → "..." (trail off)
 * - Start/middle blanks → the word "blank" (Quiplash-style)
 */
function formatBlanksForNarrator(text: string): string {
  const blanks = [...text.matchAll(/_{3,}/g)];
  if (blanks.length === 0) return text;

  const endsWithBlank = /_{3,}['"'\u2018\u2019\u201C\u201D.?!)\]]*\s*$/.test(text);

  let result = text;
  for (let i = blanks.length - 1; i >= 0; i--) {
    const m = blanks[i];
    const replacement =
      i === blanks.length - 1 && endsWithBlank ? "..." : "blank";
    result =
      result.slice(0, m.index!) +
      replacement +
      result.slice(m.index! + m[0].length);
  }
  return result;
}

function truncateForNarration(text: string, maxChars = 140): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}…`;
}

function describeVoteBand(votesFor: number, totalVotes: number): string {
  if (totalVotes <= 0) return "no-votes";
  if (votesFor === totalVotes) return "unanimous";
  const pct = votesFor / totalVotes;
  if (pct >= 0.75) return "strong";
  if (pct > 0.5) return "narrow";
  if (pct === 0.5) return "split";
  if (pct >= 0.25) return "weak";
  return "crushed";
}

/** Derive the sorted votable prompts from the current round. */
export function getVotablePrompts(game: GameState): GamePrompt[] {
  const currentRound = game.rounds[0];
  if (!currentRound) return [];
  return [...currentRound.prompts]
    .filter(
      (p) =>
        p.responses.length >= 2 &&
        !p.responses.some((r) => r.text === FORFEIT_MARKER),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function buildSystemPrompt(
  players: Pick<GamePlayer, "name" | "type">[],
  totalRounds: number,
): string {
  const playerList = players
    .filter((p) => p.type !== "SPECTATOR")
    .map((p) => p.name)
    .join(", ");

  return `You are the live host of Sloplash — a comedy game show where players write jokes, then vote on anonymous matchups.

PERSONA: Sharp, sarcastic comedy host. British panel show meets late-night — dry wit, quick riffs, strong opinions. Use player names, pick up on streaks, roast people who keep losing.

RULES:
- Read all answers verbatim, word for word, even if crude or profane.
- Joke ownership is ALWAYS anonymous. Never reveal, guess, or imply who wrote any specific joke.
- Never label a specific joke as "AI" or "human".
- Never recite exact numeric scores from standings.
- English only.

PACING — the game auto-advances on timers, so keep it tight:
- Matchups: target 8-12 seconds max. Keep banter very short.
- Vote results: target 4-6 seconds max. One punchy line.
- Round endings / transitions: 1 short sentence.
- Keep reactions varied. Avoid repeating stock wording across consecutive events.
- If timing is tight, skip banter and just read prompt + jokes cleanly.
- Hard caps: matchup <= 35 words, vote result <= 18 words, round ending <= 22 words.

MATCHUPS:
- Start every matchup with the exact phrase: "The prompt is:"
- Then read the <prompt>, then both jokes naturally.
- For matchup events, do ONLY this: prompt, first joke, second joke. No extra commentary.
- Keep answers anonymous and natural. Say "first joke" / "second joke" or "one answer" / "another answer".
  If the prompt trails off with "...", complete the sentence with each joke:
    <prompt>The worst thing to say at a funeral is ...</prompt> + <joke>he owed me money</joke> / <joke>this could've been an email</joke>
    → "The prompt is: Worst thing to say at a funeral... one answer says 'he owed me money'... another says 'this could've been an email'."
  If the prompt contains the word "blank", read it as "blank" then fill in with each joke:
    <prompt>blank: A Star Wars Story</prompt> + <joke>Jar Jar's Revenge</joke> / <joke>Tax Evasion</joke>
    → "The prompt is: Blank, A Star Wars Story. First joke: 'Jar Jar's Revenge'. Second joke: 'Tax Evasion'."
  If the prompt has both "blank" and "...", read "blank" for the mid-sentence gaps and trail off at the end:
    <prompt>I'm sorry I'm late, my blank got stuck in the ...</prompt> + <joke>emotional support peacock</joke>
    → "The prompt is: I'm sorry I'm late, my blank got stuck in the... one answer says 'emotional support peacock'."
  If it's a standalone question, read it then land each joke:
    <prompt>Write a fortune cookie that would ruin someone's day</prompt> + two jokes
    → "The prompt is: Fortune cookie that ruins your day. One answer... another answer..."

VOTE RESULTS — you may name the winning player:
  <winner name="Jake"/><margin>blowout</margin>
    → "Jake wins in a landslide."
  <winner name="Ana"/><margin>razor close</margin>
    → "Ana steals it by a hair."
  <unanimous>true</unanimous>
    → "Unanimous vote. No debate at all."
  <outcome>tie</outcome> → "It's a tie. Split crowd."

ROUND ENDINGS:
- React to highlights, do NOT read a full scoreboard line-by-line.
- Use <leader> and <trailer> names only (no exact scores), plus <bestJoke>/<worstJoke>.
- One punchy line: praise, roast, or joke about the funniest winner/loser answer.
- If final=true, also crown the winner.

PLAYERS: ${playerList}
ROUNDS: ${totalRounds} (points double each round).`;
}

export function buildGameStartEvent(game: GameState): string {
  return `<event type="game_start"><round>1</round><totalRounds>${game.totalRounds}</totalRounds></event>`;
}

export function buildHurryUpEvent(secondsLeft: number): string {
  return `<event type="hurry_up"><secondsLeft>${secondsLeft}</secondsLeft></event>`;
}

export function buildVotingStartEvent(game: GameState): string {
  const votableCount = getVotablePrompts(game).length;
  return `<event type="voting_start"><matchupCount>${votableCount}</matchupCount></event>`;
}

export function buildMatchupEvent(
  game: GameState,
  votablePrompts: GamePrompt[],
): string {
  const prompt = votablePrompts[game.votingPromptIndex];
  if (!prompt || prompt.responses.length < 2) return "";
  const [respA, respB] = prompt.responses;

  return [
    `<event type="matchup">`,
    `<opener>The prompt is:</opener>`,
    `<prompt>${escapeXml(formatBlanksForNarrator(prompt.text))}</prompt>`,
    `<joke>${escapeXml(respA.text)}</joke>`,
    `<joke>${escapeXml(respB.text)}</joke>`,
    `</event>`,
  ].join("\n");
}

export function buildVoteResultEvent(
  game: GameState,
  votablePrompts: GamePrompt[],
): string {
  const prompt = votablePrompts[game.votingPromptIndex];
  if (!prompt || prompt.responses.length < 2) return "";

  const castVotes = filterCastVotes(prompt.votes);
  const [respA, respB] = prompt.responses;
  const votesA = castVotes.filter((v) => v.responseId === respA.id).length;
  const votesB = castVotes.filter((v) => v.responseId === respB.id).length;
  const totalVotes = castVotes.length;

  const isTie = votesA === votesB;
  const winner = isTie ? null : votesA > votesB ? respA : respB;
  const unanimous = !isTie && Math.min(votesA, votesB) === 0 && totalVotes > 0;
  const findPlayer = (id: string) =>
    game.players.find((p) => p.id === id) ?? { name: "Unknown" };

  // Describe the margin in natural language instead of raw numbers
  let margin: string;
  if (isTie) {
    margin = "dead tie";
  } else if (unanimous) {
    margin = "shutout";
  } else {
    const spread = Math.abs(votesA - votesB);
    margin = spread <= 1 ? "razor close" : spread <= 3 ? "comfortable" : "blowout";
  }

  const winnerName =
    winner == null ? null : findPlayer(winner.playerId).name;

  return [
    `<event type="vote_result">`,
    isTie ? `<outcome>tie</outcome>` : `<outcome>winner</outcome>`,
    winnerName ? `<winner name="${escapeXml(winnerName)}"/>` : ``,
    `<margin>${margin}</margin>`,
    unanimous ? `<unanimous>true</unanimous>` : ``,
    `</event>`,
  ].filter(Boolean).join("\n");
}

export function buildRoundOverEvent(game: GameState): string {
  const isFinal = game.currentRound >= game.totalRounds;
  const sorted = [...game.players]
    .filter((p) => p.type !== "SPECTATOR")
    .sort((a, b) => b.score - a.score);
  const currentRound = game.rounds[0];

  const responseVoteStats = (currentRound?.prompts ?? [])
    .filter(
      (prompt) =>
        prompt.responses.length >= 2 &&
        !prompt.responses.some((response) => response.text === FORFEIT_MARKER),
    )
    .flatMap((prompt) => {
      const castVotes = filterCastVotes(prompt.votes);
      const totalVotes = castVotes.length;
      return prompt.responses.map((response) => {
        const votesFor = castVotes.filter((vote) => vote.responseId === response.id).length;
        return {
          promptText: prompt.text,
          responseText: response.text,
          playerId: response.playerId,
          votesFor,
          totalVotes,
          voteBand: describeVoteBand(votesFor, totalVotes),
          votePct: totalVotes > 0 ? votesFor / totalVotes : 0,
        };
      });
    });

  const bestJoke = [...responseVoteStats].sort((a, b) => {
    if (b.votePct !== a.votePct) return b.votePct - a.votePct;
    return b.votesFor - a.votesFor;
  })[0] ?? null;

  const worstJoke = [...responseVoteStats].sort((a, b) => {
    if (a.votePct !== b.votePct) return a.votePct - b.votePct;
    return a.votesFor - b.votesFor;
  })[0] ?? null;

  const findPlayerName = (playerId: string): string =>
    sorted.find((p) => p.id === playerId)?.name ?? "Unknown";

  const winnerEl = isFinal && sorted[0]
    ? `\n<winner name="${escapeXml(sorted[0].name)}"/>`
    : "";

  return [
    `<event type="round_over">`,
    `<round>${game.currentRound}</round>`,
    `<totalRounds>${game.totalRounds}</totalRounds>`,
    `<final>${isFinal}</final>${winnerEl}`,
    sorted[0] ? `<leader name="${escapeXml(sorted[0].name)}"/>` : ``,
    sorted.at(-1) ? `<trailer name="${escapeXml(sorted.at(-1)!.name)}"/>` : ``,
    bestJoke
      ? `<bestJoke player="${escapeXml(findPlayerName(bestJoke.playerId))}" voteBand="${bestJoke.voteBand}"><prompt>${escapeXml(truncateForNarration(bestJoke.promptText))}</prompt><joke>${escapeXml(truncateForNarration(bestJoke.responseText))}</joke></bestJoke>`
      : ``,
    worstJoke
      ? `<worstJoke player="${escapeXml(findPlayerName(worstJoke.playerId))}" voteBand="${worstJoke.voteBand}"><prompt>${escapeXml(truncateForNarration(worstJoke.promptText))}</prompt><joke>${escapeXml(truncateForNarration(worstJoke.responseText))}</joke></worstJoke>`
      : ``,
    `</event>`,
  ].join("\n");
}

export function buildNextRoundEvent(game: GameState): string {
  const multiplier = Math.pow(2, game.currentRound - 1);
  return [
    `<event type="next_round">`,
    `<round>${game.currentRound}</round>`,
    `<totalRounds>${game.totalRounds}</totalRounds>`,
    `<multiplier>${multiplier}</multiplier>`,
    `</event>`,
  ].join("\n");
}
