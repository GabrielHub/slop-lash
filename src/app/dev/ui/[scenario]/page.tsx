import { FixtureScreen, type FixtureLayout } from "@/dev/fixture-screen";

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
  const resolved: FixtureLayout =
    layout === "controller" || layout === "game" || layout === "recap" ? layout : "stage";
  return <FixtureScreen key={`${scenario}:${resolved}`} id={scenario} layout={resolved} />;
}
