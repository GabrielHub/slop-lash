import Link from "next/link";
import { FIXTURES } from "@/dev/fixtures";
import { DevThemeToggle } from "@/dev/dev-theme-toggle";

export const metadata = {
  title: "Dev UI Fixtures",
};

export default function DevUiIndexPage() {
  return (
    <main className="min-h-svh px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink">Game fixtures</h1>
            <p className="mt-1 text-sm text-ink-dim">
              Static room views rendered through the live stage and controller screens.
            </p>
          </div>
          <DevThemeToggle />
        </header>
        {Object.entries(FIXTURES).map(([gameType, fixtures]) => (
          <section key={gameType}>
            <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-dim">
              {gameType}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fixtures.map((fixture) => (
                <div
                  key={fixture.id}
                  className="rounded-xl border-2 border-edge bg-surface/80 p-4"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <p className="font-display font-bold text-ink">{fixture.label}</p>
                  <p className="mt-1 text-xs font-mono text-ink-dim">
                    {fixture.view.room.status} · {fixture.view.room.phase}
                  </p>
                  <div className="mt-3 flex gap-2 text-sm">
                    {/* A finished room also renders as the static, never-live recap page. */}
                    {(fixture.view.room.status === "FINISHED"
                      ? (["stage", "controller", "game", "recap"] as const)
                      : (["stage", "controller", "game"] as const)
                    ).map((layout) => (
                      <Link
                        key={layout}
                        href={`/dev/ui/${fixture.id}?layout=${layout}`}
                        className="rounded-md border border-edge px-2 py-1 text-ink-dim hover:border-edge-strong hover:text-ink"
                      >
                        {layout}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              {fixtures.length === 0 && <p className="text-sm text-ink-dim">No fixtures yet.</p>}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
