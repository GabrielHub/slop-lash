"use client";

import { useCallback, type ReactNode } from "react";
import type { MomentCue } from "@/room/moment";
import { useModeView, usePlayers, useRoom, type ModeView } from "@/room/context";
import { Avatar } from "@/room/avatar";
import type { QuizslopAwardKind } from "../types";
import { finalTimes, revealBetTimes } from "./beats";
import { rankBy, type Ranked } from "@/games/core/player-rankings";

export type QuizslopMode = ModeView<"QUIZSLOP">;
export type QuizslopRound = NonNullable<QuizslopMode["round"]>;
export type QuizslopBet = QuizslopMode["calls"]["list"][number];

export function useQuizslop(): QuizslopMode {
  return useModeView("QUIZSLOP");
}

/** A player's name by id, kicked players included (the view's `names` covers the whole game). */
export function useNames(): (id: string | null | undefined) => string {
  const { names } = useQuizslop();
  const { byId } = usePlayers();
  return useCallback(
    (id) => (id ? (names[id] ?? byId(id)?.name ?? "Someone") : "Someone"),
    [names, byId],
  );
}

/** An avatar for any player in the game, by id. */
export function PlayerAvatar({
  id,
  size,
  className = "",
}: {
  id: string;
  size: string;
  className?: string;
}) {
  const name = useNames();
  const { byId } = usePlayers();
  return (
    <Avatar name={name(id)} modelId={byId(id)?.modelId ?? null} size={size} className={className} />
  );
}

/** Player ids in seat order, for ordering bets the same way on every screen. */
export function useSeatOrder(): string[] {
  const { players } = usePlayers();
  const { seats } = useQuizslop();
  const order = seats.map((seat) => seat.playerId);
  for (const player of players) if (!order.includes(player.id)) order.push(player.id);
  return order;
}

/** The viewer's seat, if they have one. */
export function useMySeat() {
  const { view } = useRoom();
  const { seats } = useQuizslop();
  const meId = view.me?.playerId ?? null;
  return { meId, seat: seats.find((entry) => entry.playerId === meId) ?? null };
}

/* ─── Labels and formats ─── */

export const AWARD_LABELS: Record<QuizslopAwardKind, string> = {
  CALLED_IT: "CALLED IT",
  FALSE_ALARM_DEPARTMENT: "FALSE ALARM DEPARTMENT",
  SUSPICIOUSLY_WELL_READ: "SUSPICIOUSLY WELL-READ",
};

export const CHOICE_LETTERS = ["A", "B", "C", "D"] as const;

/** The topic title's size on the stage, by length; the last round's is capped so DOUBLE POINTS fits. */
export function titleSize(label: string, lastRound: boolean): string {
  const length = label.length;
  const size =
    length <= 12 ? "text-9xl" : length <= 18 ? "text-8xl" : length <= 26 ? "text-7xl" : "text-6xl";
  return lastRound && size === "text-9xl" ? "text-8xl" : size;
}

export function promptSize(prompt: string): string {
  return prompt.length <= 110 ? "text-4xl" : "text-3xl";
}

/** Choice text size for a question, by its longest choice, so all four tiles match. */
export function choiceSize(choices: readonly string[]): string {
  const longest = Math.max(0, ...choices.map((choice) => choice.length));
  return longest <= 24 ? "text-3xl" : longest <= 44 ? "text-2xl" : "text-xl";
}

/** A hero name's size by length. */
export function heroNameSize(name: string): string {
  return name.length <= 12 ? "text-8xl" : name.length <= 20 ? "text-7xl" : "text-6xl";
}

/** "Marcus", "Marcus & Tal", "3 players". */
export function joinNames(names: readonly string[], many = (n: number) => `${n} players`) {
  if (names.length <= 2) return names.join(" & ");
  return many(names.length);
}

/* ─── Round helpers ─── */

/** The round's opening phase: CALL, or ANSWER when CALL never ran. */
export function isOpeningPhase(phase: string, mode: QuizslopMode): boolean {
  return phase === "CALL" || (phase === "ANSWER" && mode.calls.decidedPlayerIds.length === 0);
}

/** Bets ordered by target, then caller, in seat order. */
export function sortBets(bets: readonly QuizslopBet[], order: readonly string[]): QuizslopBet[] {
  const seat = (id: string) => {
    const index = order.indexOf(id);
    return index === -1 ? order.length : index;
  };
  return [...bets].sort(
    (a, b) => seat(a.targetId) - seat(b.targetId) || seat(a.callerId) - seat(b.callerId),
  );
}

/**
 * One reveal step's group and the bets on it, in seat order, with when each
 * bet's verdict stamps, so the stage and the phones agree.
 */
export function useRevealStep(step: number) {
  const mode = useQuizslop();
  const order = useSeatOrder();
  const group = mode.reveal[step];
  const groupIds = group?.players.map((player) => player.playerId) ?? [];
  const bets = sortBets(
    mode.calls.list.filter((bet) => groupIds.includes(bet.targetId)),
    order,
  );
  return { group, groupIds, bets, betTimes: revealBetTimes(bets.length) };
}

/** The final's standings and the order its beats land in: losers worst first, then the winners. */
export function finalModel(mode: QuizslopMode) {
  const final = mode.final;
  const standings = final?.standings ?? [];
  const awards = final?.awards ?? [];
  const worstFirst = standings.filter((entry) => !entry.winner).reverse();
  return {
    final,
    standings,
    awards,
    winners: standings.filter((entry) => entry.winner),
    worstFirst,
    times: finalTimes(worstFirst.length, awards.length),
  };
}

/** The house-vote tally: who voted for what, and why the winner won. */
export function tallyOf(houseVote: QuizslopMode["houseVote"]) {
  const result = houseVote?.result ?? null;
  if (!houseVote || !result) return null;
  const count = (topicId: string) =>
    result.votes.find((entry) => entry.topicId === topicId)?.voterIds.length ?? 0;
  const winnerId = result.winnerTopicId;
  const total = result.votes.reduce((sum, entry) => sum + entry.voterIds.length, 0);
  const winnerVotes = winnerId ? count(winnerId) : 0;
  const tiebreak =
    winnerVotes > 0 &&
    houseVote.slate.some((topic) => topic.id !== winnerId && count(topic.id) === winnerVotes);
  const stamp = total === 0 ? "HOUSE PICK" : tiebreak ? "TIEBREAK" : null;
  return {
    winnerId,
    stamp,
    voters: (topicId: string) =>
      result.votes.find((entry) => entry.topicId === topicId)?.voterIds ?? [],
  };
}

/* ─── Standings between rounds ─── */

export interface ResultRow {
  playerId: string;
  name: string;
  total: number;
  prevTotal: number;
  delta: number;
  quiz: number;
  bets: number;
  rank: number;
  prevRank: number;
}

/**
 * Each seat's standing after this round and before it: total descending, then
 * quiz points, then bets won, then name.
 */
export function resultRows(mode: QuizslopMode, name: (id: string) => string) {
  const scores = mode.round?.scores ?? [];
  const base = mode.seats.map((seat) => {
    const score = scores.find((entry) => entry.playerId === seat.playerId);
    const quiz = score?.quiz ?? 0;
    const bets = score?.calls ?? 0;
    const total = seat.quizPoints + seat.callPoints;
    return {
      playerId: seat.playerId,
      name: name(seat.playerId),
      total,
      prevTotal: total - quiz - bets,
      delta: quiz + bets,
      quiz,
      bets,
      quizPoints: seat.quizPoints,
      prevQuizPoints: seat.quizPoints - quiz,
      wins: seat.successfulCalls,
    };
  });
  const byNow = [...base].sort(
    (a, b) =>
      b.total - a.total ||
      b.quizPoints - a.quizPoints ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name),
  );
  const byBefore = [...base].sort(
    (a, b) =>
      b.prevTotal - a.prevTotal ||
      b.prevQuizPoints - a.prevQuizPoints ||
      a.name.localeCompare(b.name),
  );
  const ranksOf = (ranked: Ranked<(typeof base)[number]>[]) =>
    new Map<string, number>(ranked.map((entry) => [entry.player.playerId, entry.rank]));
  const nowRanks = ranksOf(rankBy(byNow, (row) => row.total));
  const beforeRanks = ranksOf(rankBy(byBefore, (row) => row.prevTotal));
  const rankOf = (id: string) => nowRanks.get(id) ?? 1;
  const prevRankOf = (id: string) => beforeRanks.get(id) ?? 1;
  const toRow = (row: (typeof base)[number]): ResultRow => ({
    playerId: row.playerId,
    name: row.name,
    total: row.total,
    prevTotal: row.prevTotal,
    delta: row.delta,
    quiz: row.quiz,
    bets: row.bets,
    rank: rankOf(row.playerId),
    prevRank: prevRankOf(row.playerId),
  });
  const leadersOf = (totals: readonly { id: string; total: number }[]) => {
    if (totals.every((entry) => entry.total === totals[0]!.total)) return [];
    const top = Math.max(...totals.map((entry) => entry.total));
    return totals.filter((entry) => entry.total === top).map((entry) => entry.id);
  };
  const leaders = leadersOf(base.map((row) => ({ id: row.playerId, total: row.total })));
  const prevLeaders = leadersOf(base.map((row) => ({ id: row.playerId, total: row.prevTotal })));
  const leadChanged = leaders.length === 1 && !prevLeaders.includes(leaders[0]!);
  return {
    now: byNow.map(toRow),
    before: byBefore.map(toRow),
    leaders,
    prevLeaders,
    leadChanged,
  };
}

/* ─── Moment sequences ─── */

/**
 * Named cues in time order, so renderers can gate on a name instead of an
 * index: `seen(beat, "key")` is true once that cue has fired.
 */
export function sequence<K extends string>(entries: readonly (readonly [K, MomentCue])[]) {
  const sorted = entries
    .map(([key, cue], order) => ({ key, cue, order }))
    .sort((a, b) => a.cue.at - b.cue.at || a.order - b.order);
  const index = new Map<K, number>();
  sorted.forEach((entry, position) => {
    if (!index.has(entry.key)) index.set(entry.key, position);
  });
  return {
    cues: sorted.map((entry) => entry.cue),
    /** True once the named cue has fired (missing names count as fired). */
    seen: (beat: number, key: K) => beat > (index.get(key) ?? -1),
  };
}

/* ─── Icons (inline, currentColor; size them with a class) ─── */

function Svg({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function CheckIcon({ className = "size-4" }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 12.5 9.5 18 20 6.5" />
    </Svg>
  );
}

export function CrossIcon({ className = "size-4" }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function ClockIcon({ className = "size-4" }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2.5" />
    </Svg>
  );
}

export function TrophyIcon({ className = "size-4" }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 13v4m-3 3h6m-6 0a3 3 0 0 1 3-3 3 3 0 0 1 3 3" />
    </Svg>
  );
}
