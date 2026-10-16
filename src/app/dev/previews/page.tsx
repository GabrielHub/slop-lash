import { GAME_TYPES, type GameType } from "@/games/core/types";
import { GAME_META } from "@/games/meta";
import { PreviewLab } from "./preview-lab";

export const metadata = {
  title: "Preview lab",
};

/**
 * Dev preview lab: every game's host-page spot at host size and larger.
 * `?game=sloplash` fills the window with one spot (for frame capture),
 * `&t=3.2` holds that frame, and `?size=600` sets the gallery width.
 */
export default async function DevPreviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const slug = first(query.game);
  const game: GameType | null = GAME_TYPES.find((id) => GAME_META[id].theme === slug) ?? null;
  const t = Number(first(query.t));
  const size = Number(first(query.size));
  return (
    <PreviewLab
      game={game}
      frozenAt={Number.isFinite(t) ? t : null}
      size={Number.isFinite(size) && size > 0 ? size : 336}
    />
  );
}
