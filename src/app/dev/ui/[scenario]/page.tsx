import { notFound } from "next/navigation";
import { MockGameShell } from "@/dev/game-fixtures/mock-game-shell";
import { MockChatGameShell } from "@/dev/game-fixtures/mock-chat-game-shell";
import { MOCK_SCENARIOS, getMockScenario } from "@/dev/game-fixtures/scenarios";

export default async function DevUiScenarioPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario: slug } = await params;
  const scenario = getMockScenario(slug);

  if (!scenario) {
    notFound();
  }

  const index = MOCK_SCENARIOS.findIndex((item) => item.slug === slug);
  const previousSlug = index > 0 ? MOCK_SCENARIOS[index - 1]?.slug : undefined;
  const nextSlug =
    index >= 0 && index < MOCK_SCENARIOS.length - 1
      ? MOCK_SCENARIOS[index + 1]?.slug
      : undefined;

  if (scenario.game.gameType === "AI_CHAT_SHOWDOWN") {
    return (
      <MockChatGameShell
        key={slug}
        scenario={scenario}
        previousSlug={previousSlug}
        nextSlug={nextSlug}
      />
    );
  }

  return (
    <MockGameShell
      key={slug}
      scenario={scenario}
      previousSlug={previousSlug}
      nextSlug={nextSlug}
    />
  );
}
