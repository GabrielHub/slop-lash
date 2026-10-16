import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GAME_META } from "@/games/meta";
import { GAME_TYPES, type GameType } from "@/games/core/types";
import { HowToPlay } from "./how-to-play";

/** `/how-to-play/sloplash` and so on: the game's theme name is its slug. */
function gameFromSlug(slug: string): GameType | null {
  return GAME_TYPES.find((game) => GAME_META[game].theme === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>;
}): Promise<Metadata> {
  const game = gameFromSlug((await params).game);
  return { title: game ? `How to play ${GAME_META[game].name}` : "How to play" };
}

export default async function HowToPlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const game = gameFromSlug((await params).game);
  if (!game) notFound();
  const query = await searchParams;
  // `?t=12.5` opens paused on that frame; `?captions=0` hides the captions;
  // `?live=4` plays it for a pretend lobby of four.
  const t = Number(Array.isArray(query.t) ? query.t[0] : query.t);
  const live = Number(Array.isArray(query.live) ? query.live[0] : query.live);
  return (
    <HowToPlay
      game={game}
      frozenAt={query.t !== undefined && Number.isFinite(t) ? t : null}
      captions={query.captions !== "0"}
      live={Number.isInteger(live) && live > 0 ? live : null}
    />
  );
}
