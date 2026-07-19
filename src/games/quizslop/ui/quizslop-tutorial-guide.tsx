import { getQuizslopTutorialStep } from "./quizslop-tutorial";

export function QuizslopTutorialGuide({ phase }: { phase: string }) {
  const step = getQuizslopTutorialStep({ phase });

  return (
    <aside
      aria-label="Tutorial mode instructions"
      className="mx-auto w-full max-w-4xl rounded-2xl border-l-4 px-4 py-3 sm:px-5"
      style={{
        borderColor: "var(--qs-marquee)",
        background: "var(--qs-marquee-soft)",
      }}
    >
      <p
        className="font-mono text-[10px] font-black uppercase tracking-[0.24em]"
        style={{ color: "var(--qs-marquee)" }}
      >
        Tutorial mode · Host-paced
      </p>
      <p className="mt-1 font-display text-base font-black" style={{ color: "var(--qs-ink)" }}>
        {step.title}
      </p>
      <p className="mt-0.5 text-sm leading-relaxed" style={{ color: "var(--qs-ink-dim)" }}>
        {step.body}
      </p>
    </aside>
  );
}
