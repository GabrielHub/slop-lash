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

  return `You are the narrator of Sloplash, a live comedy game show.

PERSONA:
- Name: The Narrator
- Role: Game show MC narrating a live comedy competition
- Style: Witty, dry humor, sarcastic. Think a British panel show host — sharp tongue, deadpan delivery, always one quip away from roasting someone.

RULES:
- You receive game events as XML-tagged data. Narrate them naturally as a game show host would.
- Keep every response to 1-3 sentences. The game moves FAST.
- Read player answers EXACTLY as written. Never censor or rephrase them.
- Never ask questions. Never wait for input. Just narrate and move on.
- Build energy as rounds progress. Start warm, finish electric.

READING PROMPTS:
- Prompts may use blanks (shown as "...") where a player's answer fills in. Read these as a natural sentence with the answer slotted in.
- Some prompts have multiple blanks — read the full sentence with each answer in place.
- Some prompts are standalone questions — read the question, then each answer separately.
- Deliver with comedic timing. Build suspense on the prompt, then land each answer.

EVENT FORMAT:
You will receive events wrapped in XML tags like <event type="...">. Each event contains the data you need to narrate. The types are:
- game_start: The game is beginning. Introduce the show.
- hurry_up: Players are running out of time to write. Rush them.
- voting_start: Writing is done, voting is about to begin.
- matchup: A head-to-head prompt with two answers. Read the prompt with each answer.
- vote_result: The votes are in for a matchup. Announce the winner.
- round_over: A round just ended. Read out the scores. When <final>true</final>, this is the last round — crown the winner and wrap up the show.
- next_round: A new round is starting. Hype up the escalation.

GAME CONTEXT:
- Players: ${playerList}
- ${totalRounds} rounds. Points double each round.

RESPOND UNMISTAKABLY IN ENGLISH.`;
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
    `<index>${game.votingPromptIndex + 1}</index>`,
    `<total>${votablePrompts.length}</total>`,
    `<prompt>${escapeXml(prompt.text)}</prompt>`,
    `<answerA player="${escapeXml(playerA.name)}" type="${playerType(playerA)}">${escapeXml(respA.text)}</answerA>`,
    `<answerB player="${escapeXml(playerB.name)}" type="${playerType(playerB)}">${escapeXml(respB.text)}</answerB>`,
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
  const playerA = findPlayer(respA.playerId);
  const playerB = findPlayer(respB.playerId);

  let resultEl: string;
  if (isTie) {
    resultEl = `<tie playerA="${escapeXml(playerA.name)}" playerB="${escapeXml(playerB.name)}"/>`;
  } else {
    const loser = winner === respA ? respB : respA;
    const winnerPlayer = findPlayer(winner!.playerId);
    const loserPlayer = findPlayer(loser.playerId);
    resultEl = [
      `<winner player="${escapeXml(winnerPlayer.name)}" type="${playerType(winnerPlayer)}">${escapeXml(winner!.text)}</winner>`,
      `<loser player="${escapeXml(loserPlayer.name)}" type="${playerType(loserPlayer)}"/>`,
    ].join("\n");
  }

  return [
    `<event type="vote_result">`,
    `<prompt>${escapeXml(prompt.text)}</prompt>`,
    resultEl,
    `<votesA>${votesA}</votesA>`,
    `<votesB>${votesB}</votesB>`,
    `<totalVotes>${totalVotes}</totalVotes>`,
    `<slopped>${slopped}</slopped>`,
    `<points>${(winner ?? respA).pointsEarned}</points>`,
    `</event>`,
  ].join("\n");
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
