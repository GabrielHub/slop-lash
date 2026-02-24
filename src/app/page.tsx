import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-6 py-12">
      <div className="text-center max-w-sm w-full animate-float-in">
        {/* Title */}
        <h1 className="font-display text-7xl sm:text-8xl font-extrabold tracking-tight text-punch mb-3">
          SLOP
          <br />
          LASH
        </h1>

        {/* Divider accent */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="h-0.5 w-10 bg-edge-strong rounded-full" />
          <div className="h-1.5 w-1.5 rounded-full bg-gold" />
          <div className="h-0.5 w-10 bg-edge-strong rounded-full" />
        </div>

        <p className="text-lg text-ink-dim font-medium mb-14">
          AI vs Humans. Who&apos;s funnier?
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-4">
          <Link
            href="/host"
            className="block bg-punch hover:bg-punch-hover text-white font-display font-bold py-4 px-8 rounded-xl text-xl transition-all active:scale-[0.97]"
          >
            Host a Game
          </Link>
          <Link
            href="/join"
            className="block bg-surface hover:bg-raised text-ink font-display font-bold py-4 px-8 rounded-xl text-xl border-2 border-edge hover:border-edge-strong transition-all active:scale-[0.97]"
          >
            Join a Game
          </Link>
        </div>
      </div>
    </main>
  );
}
