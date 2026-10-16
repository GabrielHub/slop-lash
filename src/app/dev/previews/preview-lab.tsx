"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DevThemeToggle } from "@/dev/dev-theme-toggle";
import { GAME_TYPES, type GameType } from "@/games/core/types";
import { GAME_META } from "@/games/meta";
import { PreviewPlayer } from "@/tutorial/preview";

declare global {
  interface Window {
    /** Holds the lab's single spot on frame `t`, for frame capture. */
    __preview?: (t: number) => void;
  }
}

function Single({ game, frozenAt }: { game: GameType; frozenAt: number | null }) {
  const [held, setHeld] = useState(frozenAt);

  useEffect(() => {
    window.__preview = setHeld;
    return () => {
      delete window.__preview;
    };
  }, []);

  return (
    <main className="fixed inset-0">
      <PreviewPlayer game={game} frozenAt={held} />
    </main>
  );
}

function Gallery({ size }: { size: number }) {
  return (
    <main className="min-h-svh px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink">Preview spots</h1>
            <p className="mt-1 text-sm text-ink-dim">
              Host-page previews at {size}px wide. Click one to open it full size.
            </p>
          </div>
          <DevThemeToggle />
        </header>
        <div className="flex flex-wrap gap-6">
          {GAME_TYPES.map((game) => {
            const meta = GAME_META[game];
            return (
              <Link
                key={game}
                href={`/dev/previews?game=${meta.theme}`}
                data-game={meta.theme}
                className="block space-y-2"
                style={{ width: size }}
              >
                <span className="font-mono text-xs uppercase tracking-widest text-ink-dim">
                  {meta.name}
                </span>
                <span className="relative block aspect-video overflow-hidden rounded-2xl border-2 border-edge bg-canvas">
                  <PreviewPlayer game={game} />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export function PreviewLab({
  game,
  frozenAt,
  size,
}: {
  game: GameType | null;
  frozenAt: number | null;
  size: number;
}) {
  return game ? <Single game={game} frozenAt={frozenAt} /> : <Gallery size={size} />;
}
