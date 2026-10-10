import { HostForm } from "./host-form";
import { parseHostGameParam } from "./host-game-param";

/** `/host?game=QUIZSLOP` preselects a game, e.g. from a finished game's "Play again". */
export default async function HostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { game } = await searchParams;
  return <HostForm initialGameType={parseHostGameParam(game)} />;
}
