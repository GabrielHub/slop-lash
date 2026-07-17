export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center">
      <h2
        className="font-display text-2xl font-black uppercase tracking-wide"
        style={{ color: "var(--qs-ink)" }}
      >
        {title}
      </h2>
      {hint && (
        <p className="mt-1 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function WaitingCard({ text }: { text: string }) {
  return (
    <p
      className="rounded-2xl border px-4 py-4 text-center text-sm"
      style={{
        borderColor: "var(--qs-edge)",
        background: "var(--qs-surface)",
        color: "var(--qs-ink-dim)",
      }}
    >
      {text}
    </p>
  );
}
