import { notFound } from "next/navigation";
import { MockMatchSlopControllerShell } from "@/dev/game-fixtures/mock-matchslop-controller-shell";
import { MATCHSLOP_SCENARIOS, getMockScenario } from "@/dev/game-fixtures/scenarios";

export default async function DevUiMatchSlopControllerPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario: slug } = await params;
  const scenario = getMockScenario(slug);

  if (!scenario || scenario.game.gameType !== "MATCHSLOP") {
    notFound();
  }

  const index = MATCHSLOP_SCENARIOS.findIndex((item) => item.slug === slug);
  const previousSlug = index > 0 ? MATCHSLOP_SCENARIOS[index - 1]?.slug : undefined;
  const nextSlug =
    index >= 0 && index < MATCHSLOP_SCENARIOS.length - 1
      ? MATCHSLOP_SCENARIOS[index + 1]?.slug
      : undefined;

  return (
    <MockMatchSlopControllerShell
      key={slug}
      scenario={scenario}
      previousSlug={previousSlug}
      nextSlug={nextSlug}
    />
  );
}
