import type { GameState, GamePrompt, GamePlayer } from "./types";
import { filterCastVotes } from "./types";
import { FORFEIT_MARKER } from "./scoring";

export const NARRATOR_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function playerType(p: Pick<GamePlayer, "type">): string {
  return p.type === "AI" ? "ai" : "human";
}

export function buildSystemPrompt(
  players: Pick<GamePlayer, "name" | "type">[],
  totalRounds: number,
): string {
  const playerList = players
    .filter((p) => p.type !== "SPECTATOR")
    .map((p) => `${p.name} (${playerType(p)})`)
    .join(", ");

  return `You are the live host of Sloplash — a comedy game show. Players write jokes, then vote on anonymous matchups. Some players are human, some AI.

PERSONA: Sharp, sarcastic comedy host. British panel show meets late-night — dry wit, quick riffs, strong opinions. Use player names, pick up on streaks, and roast people who keep losing. Build energy each round.

RULES:
- Read answers EXACTLY as written, never censor.
- Matchup answers are anonymous. Once votes reveal the result, names are fair game.
- English only.

PACING — the game auto-advances on timers, so keep it tight:
- Matchups: you have ~20 seconds. Read the prompt and both jokes — 2-3 sentences.
- Vote results: you have ~10 seconds. One punchy reaction, that's it.
- Round endings / transitions: 1-2 sentences.

MATCHUPS — read the <prompt>, then deliver both <joke>s naturally. Never say "option A/B" or "answer one/two".
  If the prompt has a blank ("..."), fill it in with each joke:
    <prompt>The worst thing to say at a funeral is ...</prompt> + <joke>he owed me money</joke> / <joke>this could've been an email</joke>
    → "Worst thing to say at a funeral... 'he owed me money'... or how about... 'this could've been an email'."
  If it's a standalone question, read it then land each joke:
    <prompt>Write a fortune cookie that would ruin someone's day</prompt> + two jokes
    → "Fortune cookie that ruins your day. On one hand... 'your soulmate just swiped left.' On the other... 'the IRS remembers even if you don't.'"

VOTE RESULTS — don't describe the screen. React using the <winner>/<loser> names and <margin>:
  <winner name="Jake" type="human"/><loser name="SlopBot" type="ai"/><margin>blowout</margin>
    → "Jake just destroyed the machine. Not even close."
  <winner name="Ana" type="ai"/><loser name="Marcus" type="human"/><margin>razor close</margin>
    → "Oof, Marcus. One vote away from beating a robot and you blew it."
  <slopped> (everyone picked the AI thinking it was human) → maximum embarrassment, lean into it.
  <outcome>tie</outcome> → "A tie. Thrilling stuff."

ROUND ENDINGS — don't read scores. Comment on the story: who's climbing, who's collapsing. Hype stakes when points double.

PLAYERS: ${playerList}
ROUNDS: ${totalRounds} (points double each round). "Slopped" = everyone fooled by the AI answer.`;
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
  const findPlayer = (id: string) =>
    game.players.find((p) => p.id === id) ?? { name: "Unknown", type: "HUMAN" as const };
  const playerA = findPlayer(respA.playerId);
  const playerB = findPlayer(respB.playerId);

  return [
    `<event type="matchup">`,
    `<matchup>${game.votingPromptIndex + 1} of ${votablePrompts.length}</matchup>`,
    `<prompt>${escapeXml(prompt.text)}</prompt>`,
    `<joke source="${playerType(playerA)}">${escapeXml(respA.text)}</joke>`,
    `<joke source="${playerType(playerB)}">${escapeXml(respB.text)}</joke>`,
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
  const slopped = !isTie && Math.min(votesA, votesB) === 0 && totalVotes > 0;

  const findPlayer = (id: string) =>
    game.players.find((p) => p.id === id) ?? { name: "Unknown", type: "HUMAN" as const };

  // Describe the margin in natural language instead of raw numbers
  let margin: string;
  if (isTie) {
    margin = "dead tie";
  } else if (slopped) {
    margin = "shutout";
  } else {
    const spread = Math.abs(votesA - votesB);
    margin = spread <= 1 ? "razor close" : spread <= 3 ? "comfortable" : "blowout";
  }

  let resultEl: string;
  if (isTie) {
    resultEl = `<outcome>tie</outcome>`;
  } else {
    const loser = winner === respA ? respB : respA;
    const winnerPlayer = findPlayer(winner!.playerId);
    const loserPlayer = findPlayer(loser.playerId);
    resultEl = [
      `<winner name="${escapeXml(winnerPlayer.name)}" type="${playerType(winnerPlayer)}"/>`,
      `<loser name="${escapeXml(loserPlayer.name)}" type="${playerType(loserPlayer)}"/>`,
    ].join("\n");
  }

  return [
    `<event type="vote_result">`,
    resultEl,
    `<margin>${margin}</margin>`,
    slopped ? `<slopped>everyone picked the AI joke thinking it was human</slopped>` : ``,
    `</event>`,
  ].filter(Boolean).join("\n");
}

export function buildRoundOverEvent(game: GameState): string {
  const isFinal = game.currentRound >= game.totalRounds;
  const sorted = [...game.players]
    .filter((p) => p.type !== "SPECTATOR")
    .sort((a, b) => b.score - a.score);

  const scores = sorted
    .map(
      (p) =>
        `<player name="${escapeXml(p.name)}" type="${playerType(p)}" score="${p.score}"/>`,
    )
    .join("\n");

  const winnerEl = isFinal && sorted[0]
    ? `\n<winner name="${escapeXml(sorted[0].name)}" type="${playerType(sorted[0])}"/>`
    : "";

  return [
    `<event type="round_over">`,
    `<round>${game.currentRound}</round>`,
    `<totalRounds>${game.totalRounds}</totalRounds>`,
    `<final>${isFinal}</final>${winnerEl}`,
    `<scores>`,
    scores,
    `</scores>`,
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
