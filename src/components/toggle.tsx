"use client";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
  children?: React.ReactNode;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  children,
}: ToggleProps) {
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="w-full p-3 rounded-xl border-2 text-left transition-colors flex items-center gap-3 cursor-pointer bg-surface/80 backdrop-blur-sm border-edge text-ink-dim hover:border-edge-strong hover:text-ink"
      >
        <div
          className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${checked ? "bg-punch" : "bg-edge-strong"}`}
        >
          <div
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface border border-edge/50 transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
          />
        </div>
        <div>
          <span className="font-semibold text-sm">{label}</span>
          <p className="text-xs text-ink-dim/60">{description}</p>
        </div>
      </button>
      {children}
    </div>
  );
}
