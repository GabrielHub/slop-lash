import { FixtureScreen } from "@/dev/fixture-screen";
import type { RoomLayout } from "@/room/shell";

export const metadata = {
  title: "Dev UI Fixture",
};

export default async function DevUiFixturePage({
  params,
  searchParams,
}: {
  params: Promise<{ scenario: string }>;
  searchParams: Promise<{ layout?: string }>;
}) {
  const { scenario } = await params;
  const { layout } = await searchParams;
  const resolved: RoomLayout = layout === "controller" || layout === "game" ? layout : "stage";
  return <FixtureScreen key={`${scenario}:${resolved}`} id={scenario} layout={resolved} />;
}
