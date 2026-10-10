"use client";

import type { RefObject } from "react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion } from "motion/react";
import { ModelIcon } from "@/components/model-icon";
import { collapse } from "@/lib/animations";
import { FREE_PLAY_WRITER_MODEL } from "@/lib/free-play";
import type { api } from "../../../convex/_generated/api";
import { AiModelRow } from "./ai-model-row";

export type HostAccess = "FREE" | "HOST";

export type FreePlayStatus = FunctionReturnType<typeof api.freePlay.status>;

export function isFreePlayAvailable(status: FreePlayStatus | undefined): boolean {
  return status !== undefined && status.configured && status.gamesLeftToday > 0;
}

/** Why Free Play can't be used right now, or null when it can (or is still loading). */
function freePlayUnavailableNote(status: FreePlayStatus | undefined): string | null {
  if (status === undefined) return null;
  if (!status.configured) return "Free Play isn't set up here.";
  if (status.gamesLeftToday === 0) return "Free Play is out of games today.";
  return null;
}

const LINK =
  "font-semibold text-ink underline underline-offset-4 decoration-edge-strong hover:decoration-ink cursor-pointer";

/**
 * Access as a footer line rather than a first decision: Free Play by default,
 * with the host password one tap away (and the way back while it's open).
 */
export function HostAccessFooter({
  access,
  freePlayStatus,
  hostSecret,
  passwordInputRef,
  onHostSecretChange,
  onUsePassword,
  onUseFreePlay,
}: {
  access: HostAccess;
  freePlayStatus: FreePlayStatus | undefined;
  hostSecret: string;
  passwordInputRef: RefObject<HTMLInputElement | null>;
  onHostSecretChange: (secret: string) => void;
  onUsePassword: () => void;
  onUseFreePlay: () => void;
}) {
  const freeAvailable = isFreePlayAvailable(freePlayStatus);
  const unavailable = freePlayUnavailableNote(freePlayStatus);

  return (
    <div className="text-sm text-ink-dim">
      {access === "FREE" ? (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="tabular-nums">
            <span className="font-semibold text-ink">Free Play</span>
            <span aria-hidden="true"> · </span>
            {freePlayStatus === undefined
              ? "checking…"
              : `${freePlayStatus.gamesLeftToday} ${freePlayStatus.gamesLeftToday === 1 ? "game" : "games"} left today`}
          </p>
          <button type="button" onClick={onUsePassword} className={LINK}>
            Have a host password?
          </button>
        </div>
      ) : (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p>
            <span className="font-semibold text-ink">Host password</span>
            {unavailable && <span> · {unavailable}</span>}
          </p>
          {freeAvailable && (
            <button type="button" onClick={onUseFreePlay} className={LINK}>
              Use Free Play instead
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {access === "HOST" && (
          <motion.div
            key="password"
            variants={collapse}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <label htmlFor="host-secret" className="sr-only">
              Host password
            </label>
            <input
              ref={passwordInputRef}
              id="host-secret"
              type="password"
              value={hostSecret}
              onChange={(e) => onHostSecretChange(e.target.value)}
              placeholder="Host password"
              className="mt-1 mb-1 h-12 w-full rounded-xl border-2 border-edge bg-surface/80 px-4 text-base text-ink placeholder:text-ink-dim/50 focus:border-(--host-accent) focus:outline-none transition-colors"
              autoComplete="current-password"
              enterKeyHint="go"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The whole Free Play lineup: one Claude Haiku, as a rival or as the date. */
export function FreePlayRoster({
  botSelected,
  botLimit,
  personaMode,
  onBotToggle,
}: {
  botSelected: boolean;
  botLimit: number;
  personaMode: boolean;
  onBotToggle: () => void;
}) {
  if (personaMode) {
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-ai bg-ai-soft/80 p-3">
        <ModelIcon model={FREE_PLAY_WRITER_MODEL} size={24} className="shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{FREE_PLAY_WRITER_MODEL.name}</p>
          <p className="text-xs text-ink-dim">Plays your date</p>
        </div>
      </div>
    );
  }
  if (botLimit === 0) return null;
  return (
    <AiModelRow
      model={FREE_PLAY_WRITER_MODEL}
      selected={botSelected}
      detail="Your AI rival"
      onClick={onBotToggle}
    />
  );
}
