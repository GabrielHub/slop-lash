import Link from "next/link";
import {
  SLOPLASH_SCENARIOS,
  CHATSLOP_SCENARIOS,
  MOCK_SCENARIOS,
} from "@/dev/game-fixtures/scenarios";
import { DevThemeToggle } from "@/dev/dev-theme-toggle";

export const metadata = {
  title: "Dev UI Mock Flow",
};

function ScenarioCard({
  scenario,
  index,
  badge,
}: {
  scenario: (typeof MOCK_SCENARIOS)[number];
  index: number;
  badge?: string;
}) {
  return (
    <Link
      key={scenario.slug}
      href={`/dev/ui/${scenario.slug}`}
      className="rounded-xl border-2 border-edge bg-surface/80 p-4 backdrop-blur-sm transition-colors hover:border-edge-strong"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-mono text-ink-dim">#{index + 1}</span>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-teal">
              {badge}
            </span>
          )}
          <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
            {scenario.game.status}
          </span>
        </div>
      </div>
      <h2 className="font-display text-lg font-bold text-ink">
        {scenario.title}
      </h2>
      <p className="mt-1 text-sm text-ink-dim">{scenario.description}</p>
      <p className="mt-2 text-xs font-mono text-ink-dim/80">
        viewer: {scenario.playerId ?? "none"}
      </p>
    </Link>
  );
}

export default function DevUiIndexPage() {
  return (
    <main className="min-h-svh px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-mono tracking-widest text-ink-dim">
                MOCK GAME FLOW
              </p>
              <h1 className="font-display text-3xl font-bold text-ink">
                UI Iteration Routes
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-ink-dim">
                These routes render the real game screens with fixture state so
                you can iterate on layout and styling without playing through a
                live session.
              </p>
            </div>
            <DevThemeToggle />
          </div>
          <div className="mt-4">
            <Link
              href="/dev/components"
              className="inline-flex rounded-md border border-edge px-3 py-2 text-sm text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Shared Components
            </Link>
          </div>
        </header>

        <section className="mb-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-xl font-bold text-ink">
              Slop-Lash
            </h2>
            <Link
              href="/dev/components/sloplash"
              className="rounded-md border border-edge px-3 py-1.5 text-sm text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Components
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SLOPLASH_SCENARIOS.map((scenario, index) => (
              <ScenarioCard
                key={scenario.slug}
                scenario={scenario}
                index={index}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-4 mb-2">
            <h2 className="font-display text-xl font-bold text-ink">
              ChatSlop
            </h2>
            <Link
              href="/dev/components/chatslop"
              className="rounded-md border border-edge px-3 py-1.5 text-sm text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Components
            </Link>
          </div>
          <p className="text-sm text-ink-dim mb-4">
            ChatSlop fixtures with optimistic chat, disconnect/quorum, and
            rejoin flows.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CHATSLOP_SCENARIOS.map((scenario, index) => (
              <ScenarioCard
                key={scenario.slug}
                scenario={scenario}
                index={index}
                badge="ChatSlop"
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
