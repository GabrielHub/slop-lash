"use client";

import type { Ref } from "react";
import { MAX_PLAYER_NAME_LENGTH } from "@/games/core/constants";

/**
 * The "Your name" field shared by the join and host forms: the label, a
 * counter that appears near the limit, and the input. `focusClass` sets the
 * focused border colour; `labelClassName` adds spacing above the label.
 */
export function NameField({
  id,
  ref,
  value,
  onChange,
  focusClass,
  enterKeyHint,
  labelClassName = "",
}: {
  id: string;
  ref: Ref<HTMLInputElement>;
  value: string;
  onChange: (name: string) => void;
  focusClass: string;
  enterKeyHint: "done" | "go";
  labelClassName?: string;
}) {
  return (
    <>
      <label
        htmlFor={id}
        className={`mb-2 flex items-baseline justify-between text-sm font-medium text-ink-dim ${labelClassName}`}
      >
        Your name
        {value.length >= 15 && (
          <span
            className={`text-xs tabular-nums ${value.length >= MAX_PLAYER_NAME_LENGTH ? "text-punch" : "text-ink-dim/60"}`}
          >
            {value.length}/{MAX_PLAYER_NAME_LENGTH}
          </span>
        )}
      </label>
      <input
        ref={ref}
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="What should we call you?"
        className={`h-14 w-full rounded-xl border-2 border-edge bg-surface/80 px-4 text-lg text-ink placeholder:text-ink-dim/40 focus:outline-none transition-colors ${focusClass}`}
        maxLength={MAX_PLAYER_NAME_LENGTH}
        autoComplete="name"
        autoCapitalize="words"
        enterKeyHint={enterKeyHint}
      />
    </>
  );
}
