import Link from "next/link";
import { MOCK_SCENARIOS } from "@/dev/game-fixtures/scenarios";
import { DevThemeToggle } from "@/dev/dev-theme-toggle";

export const metadata = {
  title: "Dev UI Mock Flow",
};

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
                These routes render the real game screens with fixture state so you can iterate on layout and styling
                without playing through a live session.
              </p>
            </div>
            <DevThemeToggle />
          </div>
          <div className="mt-4">
            <Link
              href="/dev/components"
              className="inline-flex rounded-md border border-edge px-3 py-2 text-sm text-ink-dim hover:border-edge-strong hover:text-ink"
            >
              Open Component Playground
            </Link>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {MOCK_SCENARIOS.map((scenario, index) => (
            <Link
              key={scenario.slug}
              href={`/dev/ui/${scenario.slug}`}
              className="rounded-xl border-2 border-edge bg-surface/80 p-4 backdrop-blur-sm transition-colors hover:border-edge-strong"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-ink-dim">#{index + 1}</span>
                <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
                  {scenario.game.status}
                </span>
              </div>
              <h2 className="font-display text-lg font-bold text-ink">{scenario.title}</h2>
              <p className="mt-1 text-sm text-ink-dim">{scenario.description}</p>
              <p className="mt-2 text-xs font-mono text-ink-dim/80">
                viewer: {scenario.playerId ?? "none"}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
