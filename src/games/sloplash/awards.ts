import type { SloplashRound } from "../../../convex/sloplash/view";
import { matchupOutcome } from "./outcomes";
import type { PlayerType } from "./scoring";

export type AwardKind = "mvp" | "crowdFavorite" | "botSlayer" | "flawless" | "hotStreak" | "slopped";

export interface Award {
  kind: AwardKind;
  playerId: string;
  icon: string;
  title: string;
  description: string;
}

export type AwardPlayer = { id: string; type: PlayerType; score: number };

/** Priority order: earlier kinds claim players first. Screens reveal them in reverse. */
export const AWARD_PRIORITY: readonly AwardKind[] = [
  "mvp",
  "crowdFavorite",
  "botSlayer",
  "flawless",
  "hotStreak",
  "slopped",
];

/** Screens reveal awards in reverse priority, so the biggest one lands last. */
const AWARD_DISPLAY = AWARD_PRIORITY.toReversed();

export function displayAwards(awards: readonly Award[]): Award[] {
  return awards.toSorted((a, b) => AWARD_DISPLAY.indexOf(a.kind) - AWARD_DISPLAY.indexOf(b.kind));
}

export const MAX_AWARDS = 5;
const HOT_STREAK_MIN = 3;

const AWARD_COPY: Record<AwardKind, { title: string; icon: string; description: string }> = {
  mvp: { title: "MVP", icon: "\u{1F3C6}", description: "Top score" },
  crowdFavorite: { title: "Crowd Favorite", icon: "⭐", description: "Most votes" },
  botSlayer: { title: "Bot Slayer", icon: "⚔️", description: "Beat a bot" },
  flawless: { title: "Flawless", icon: "✨", description: "Won unanimously" },
  hotStreak: { title: "Hot Streak", icon: "\u{1F525}", description: "{n} wins in a row" },
  slopped: { title: "Slopped", icon: "\u{1F4A9}", description: "Swept by a bot" },
};

type Tally = {
  votes: number;
  botWins: number;
  flawless: number;
  slopped: number;
  bestStreak: number;
  streak: number;
};

/** Per-player counts over contested, revealed matchups in reveal order (walkovers and voids skipped). */
function tally(rounds: readonly SloplashRound[], players: readonly AwardPlayer[]) {
  const types = new Map(players.map((player) => [player.id, player.type]));
  const typeOf = (id: string) => types.get(id);
  const tallies = new Map<string, Tally>(
    players.map((player) => [
      player.id,
      { votes: 0, botWins: 0, flawless: 0, slopped: 0, bestStreak: 0, streak: 0 },
    ]),
  );
  const ordered = rounds
    .toSorted((left, right) => left.number - right.number)
    .flatMap((round) =>
      round.prompts
        .filter((prompt) => prompt.revealed && prompt.kind === "vote" && prompt.order !== null)
        .toSorted((left, right) => left.order! - right.order!)
        .map((prompt) => ({ prompt, round: round.number })),
    );

  for (const { prompt, round } of ordered) {
    const { score, stamp } = matchupOutcome(prompt, round, typeOf);
    for (const answer of prompt.answers) {
      const entry = answer.playerId ? tallies.get(answer.playerId) : undefined;
      if (!entry) continue;
      entry.votes += score.votes[answer.id] ?? 0;
      const won = score.outcome === "win" && score.winnerId === answer.id;
      if (!won) {
        entry.streak = 0;
        if (stamp === "slopped" && typeOf(answer.playerId!) === "HUMAN") entry.slopped += 1;
        continue;
      }
      entry.streak += 1;
      entry.bestStreak = Math.max(entry.bestStreak, entry.streak);
      if (score.unanimous) entry.flawless += 1;
      const loser = prompt.answers.find((other) => other.id !== answer.id);
      if (
        typeOf(answer.playerId!) === "HUMAN" &&
        loser?.playerId &&
        typeOf(loser.playerId) === "AI"
      ) {
        entry.botWins += 1;
      }
    }
  }
  return tallies;
}

/**
 * The game's awards, in priority order (MVP first): at most one per player
 * and five in total. Computed from revealed contested matchups only.
 */
export function computeAwards(
  rounds: readonly SloplashRound[],
  players: readonly AwardPlayer[],
): Award[] {
  const tallies = tally(rounds, players);
  const seat = new Map(players.map((player, index) => [player.id, index]));
  const awarded = new Set<string>();
  const awards: Award[] = [];
  const give = (kind: AwardKind, player: AwardPlayer, n?: number) => {
    const copy = AWARD_COPY[kind];
    awarded.add(player.id);
    awards.push({
      kind,
      playerId: player.id,
      icon: copy.icon,
      title: copy.title,
      description: copy.description.replace("{n}", String(n ?? 0)),
    });
  };
  const open = () => players.filter((player) => !awarded.has(player.id));
  const bySeat = (left: AwardPlayer, right: AwardPlayer) => seat.get(left.id)! - seat.get(right.id)!;
  const metricOf = (player: AwardPlayer, kind: AwardKind) => {
    const entry = tallies.get(player.id)!;
    if (kind === "botSlayer") return player.type === "HUMAN" ? entry.botWins : 0;
    if (kind === "flawless") return entry.flawless;
    if (kind === "hotStreak") return entry.bestStreak >= HOT_STREAK_MIN ? entry.bestStreak : 0;
    if (kind === "slopped") return player.type === "HUMAN" ? entry.slopped : 0;
    return 0;
  };

  for (const kind of AWARD_PRIORITY) {
    if (awards.length >= MAX_AWARDS) break;
    if (kind === "mvp") {
      const top = Math.max(0, ...players.map((player) => player.score));
      const leaders = players.filter((player) => player.score === top);
      if (top > 0 && leaders.length === 1) give(kind, leaders[0]!);
      continue;
    }
    if (kind === "crowdFavorite") {
      const most = Math.max(0, ...players.map((player) => tallies.get(player.id)!.votes));
      if (most < 1) continue;
      const pick = open()
        .filter((player) => tallies.get(player.id)!.votes === most)
        .toSorted((left, right) => right.score - left.score || bySeat(left, right))[0];
      if (pick) give(kind, pick);
      continue;
    }
    const pick = open()
      .filter((player) => metricOf(player, kind) > 0)
      .toSorted(
        (left, right) =>
          metricOf(right, kind) - metricOf(left, kind) ||
          (kind === "slopped" ? left.score - right.score : right.score - left.score) ||
          bySeat(left, right),
      )[0];
    if (pick) give(kind, pick, metricOf(pick, kind));
  }
  return awards;
}
