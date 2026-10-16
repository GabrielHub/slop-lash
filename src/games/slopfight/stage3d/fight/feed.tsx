"use client";

// What the fight scenes read from the room: the current fight row, both
// champions, their owners and the players (names for the bars, avatars for the
// bets), plus the clock offset and whether the room is live. In a room it
// comes from the SlopFight mode view; the dev fight lab (and anything else
// outside a room) provides it through FightFeedProvider instead, so the real
// scenes render without a backend.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useOptionalRoom, type RoomContextValue } from "@/room/context";
import type { MatchupNote, Side } from "../../modifiers";
import type { Champion } from "../../sheet";
import type { ArenaId } from "../../arenas";
import type { StoredOutcomeLike } from "./playback";

/** A matchup note as the face-off card shows it (`applied` in the view). */
export interface AppliedNoteView {
  side: Side;
  modifies: MatchupNote["modifies"];
  reason: string;
  value: number;
  favors: Side;
  capped: boolean;
  dropped: boolean;
}

/** The parts of a fight row the scenes read; the room view's fight satisfies it. */
export interface FightRow {
  id: string;
  round: number;
  step: number;
  a: string;
  b: string;
  arena: ArenaId;
  limitMs: number;
  isFinal: boolean;
  isThirdPlace: boolean;
  matchup: "PENDING" | "READY" | "FAILED";
  notes: readonly MatchupNote[];
  applied: readonly AppliedNoteView[];
  walkOn: readonly string[] | null;
  hype: { A: number; B: number };
  bets: { A: readonly string[]; B: readonly string[] };
  seed: number | null;
  startsAt: number | null;
  outcome: StoredOutcomeLike | null;
  decidedBySeed: boolean;
  awards: ReadonlyArray<{ playerId: string; reason: "WIN" | "FINISH" | "BET"; points: number }> | null;
  sheets: { A: Champion; B: Champion } | null;
  recapLine: string | null;
}

export interface FeedPlayer {
  id: string;
  name: string;
  modelId: string | null;
  score: number;
}

export interface FeedFighter {
  id: string;
  /** Roster slot (0..3): the fighter's roster mark. */
  slot: number | null;
  ownerId: string | null;
  champion: Champion | null;
}

export interface FightFeed {
  /** Every fight so far (the recap reel), in order. */
  fights: readonly FightRow[];
  /** The fight on now (FACE_OFF / FIGHT / RESULT), else null. */
  current: FightRow | null;
  fighters: readonly FeedFighter[];
  players: readonly FeedPlayer[];
  clockOffsetMs: number;
  live: boolean;
  /** The game's seed for The Voice (one Voice per game). */
  roomKey: string;
}

const FeedContext = createContext<FightFeed | null>(null);

/** Provide the fight data directly (dev lab, tests). */
export function FightFeedProvider({ feed, children }: { feed: FightFeed; children: ReactNode }) {
  return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>;
}

function feedFromRoom(room: RoomContextValue): FightFeed | null {
  const view = room.view.mode;
  if (view.kind !== "SLOPFIGHT") return null;
  const fights: readonly FightRow[] = view.fights;
  return {
    fights,
    current: fights.find((fight) => fight.id === view.currentFightId) ?? null,
    fighters: view.fighters.map((fighter) => ({
      id: fighter.id,
      slot: fighter.slot,
      ownerId: fighter.ownerId,
      champion: fighter.champion,
    })),
    players: room.view.players.map((player) => ({
      id: player.id,
      name: player.name,
      modelId: player.modelId,
      score: player.score,
    })),
    clockOffsetMs: room.clockOffsetMs,
    live: room.live,
    roomKey: `${room.view.room.code}:${room.view.room.gameNumber}`,
  };
}

/** The fight data: the dev provider's, else the room's (null outside both). */
export function useFightFeed(): FightFeed | null {
  const provided = useContext(FeedContext);
  const room = useOptionalRoom();
  const view = room?.view;
  const offset = room?.clockOffsetMs;
  const live = room?.live;
  const crowd = useQuery(
    api.slopfight.stage.hype,
    !provided && live && room?.capability !== "fixture" && view?.room.phase === "FIGHT"
      ? { roomCode: view.room.code }
      : "skip",
  );
  return useMemo(
    () => {
      const feed = provided ?? (room ? feedFromRoom(room) : null);
      if (!feed?.current || !crowd || feed.current.id !== crowd.fightId) return feed;
      return { ...feed, current: { ...feed.current, hype: crowd.hype } };
    },
    // Recompute when the room's view or clock changes (room itself is a memoized value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provided, view, offset, live, crowd],
  );
}

/** Both champions of a fight: frozen sheets when the row has them, else the fighters' current ones. */
export function sheetsOf(feed: FightFeed, fight: FightRow): { A: Champion | null; B: Champion | null } {
  if (fight.sheets) return { A: fight.sheets.A, B: fight.sheets.B };
  const byId = (id: string) => feed.fighters.find((fighter) => fighter.id === id)?.champion ?? null;
  return { A: byId(fight.a), B: byId(fight.b) };
}

export function ownersOf(feed: FightFeed, fight: FightRow): { A: string | null; B: string | null } {
  const owner = (id: string) => feed.fighters.find((fighter) => fighter.id === id)?.ownerId ?? null;
  return { A: owner(fight.a), B: owner(fight.b) };
}

export function playerName(feed: FightFeed, id: string | null): string | null {
  if (!id) return null;
  return feed.players.find((player) => player.id === id)?.name ?? null;
}
