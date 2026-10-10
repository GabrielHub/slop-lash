"use client";

import type { ReactNode } from "react";

/** One labelled on/off row in the host page's "More options"; it reads `--host-accent` from the form. */
export function OptionSwitch({
  label,
  checked,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Extra controls shown under the row, e.g. the narrator's voice picker. */
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="flex h-12 w-full cursor-pointer items-center justify-between gap-4 text-left text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--host-accent)/60 rounded-lg"
      >
        {label}
        <span
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-(--host-accent)" : "bg-edge-strong"}`}
          aria-hidden="true"
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-surface transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
          />
        </span>
      </button>
      {children}
    </div>
  );
}
