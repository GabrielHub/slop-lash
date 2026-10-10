import { Metadata } from "next";
import { RecapShell } from "./recap-shell";

export const metadata: Metadata = {
  title: "Game Recap",
};

/** The game number in `?game=`, or 1 when it is missing or not a positive integer. */
function parseGameNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw !== undefined && /^[1-9]\d{0,5}$/u.test(raw) ? Number(raw) : 1;
}

/** `/game/CODE/recap` is the room's first game; `?game=N` is the Nth (one per "Play again"). */
export default async function RecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ game?: string | string[] }>;
}) {
  const [{ code }, { game }] = await Promise.all([params, searchParams]);
  return <RecapShell code={code} gameNumber={parseGameNumber(game)} />;
}
