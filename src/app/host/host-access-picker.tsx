"use client";

import type { FunctionReturnType } from "convex/server";
import { motion } from "motion/react";
import { ModelIcon } from "@/components/model-icon";
import { buttonTap } from "@/lib/animations";
import { FREE_PLAY_WRITER_MODEL } from "@/lib/free-play";
import { AI_MODELS, JEV_MODEL } from "@/lib/models";
import type { api } from "../../../convex/_generated/api";
import { AiModelRow } from "./ai-model-row";

export type HostAccess = "FREE" | "HOST";

export type FreePlayStatus = FunctionReturnType<typeof api.freePlay.status>;

const LOCKED_MODEL_COUNT = AI_MODELS.length - 1;

function KeyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10 13l9-9M16 7l2 2M14 9l2 2" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function freePlayNote(status: FreePlayStatus | undefined): string {
  if (status === undefined) return "Checking availability...";
  if (!status.configured) return "Not set up yet";
  if (status.gamesLeftToday === 0) return "Out of games today";
  return `${status.gamesLeftToday} left today`;
}

export function isFreePlayAvailable(status: FreePlayStatus | undefined): boolean {
  return status !== undefined && status.configured && status.gamesLeftToday > 0;
}

export function HostAccessPicker({
  access,
  freePlayStatus,
  onAccessChange,
}: {
  access: HostAccess;
  freePlayStatus: FreePlayStatus | undefined;
  onAccessChange: (access: HostAccess) => void;
}) {
  const freeAvailable = isFreePlayAvailable(freePlayStatus);
  const options = [
    {
      id: "FREE" as const,
      icon: <SparkIcon />,
      title: "Free Play",
      body: "Claude Haiku writes, Jev judges. No password.",
      note: freePlayNote(freePlayStatus),
      disabled: !freeAvailable,
    },
    {
      id: "HOST" as const,
      icon: <KeyIcon />,
      title: "Host Password",
      body: "Every model, narrator voice, and portraits.",
      note: "Password required",
      disabled: false,
    },
  ];

  return (
    <fieldset className="mb-6">
      <legend className="block text-sm font-medium text-ink-dim mb-2">Access</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const selected = access === option.id;
          return (
            <motion.label
              key={option.id}
              className={`flex h-full flex-col rounded-xl border-2 p-3 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-punch/50 ${
                option.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              } ${
                selected
                  ? "border-punch bg-punch/10"
                  : "border-edge bg-surface/80 hover:border-edge-strong"
              }`}
              {...(option.disabled ? {} : buttonTap)}
            >
              <input
                type="radio"
                name="host-access"
                value={option.id}
                checked={selected}
                disabled={option.disabled}
                onChange={() => onAccessChange(option.id)}
                className="sr-only"
              />
              <span
                className={`flex items-center gap-1.5 text-sm font-semibold ${selected ? "text-punch" : "text-ink"}`}
              >
                {option.icon}
                {option.title}
              </span>
              <span className="mt-1 text-xs leading-snug text-ink-dim">{option.body}</span>
              <span
                className={`mt-auto pt-2 font-mono text-[11px] tabular-nums ${selected ? "text-punch/80" : "text-ink-dim/60"}`}
              >
                {option.note}
              </span>
            </motion.label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Shown in place of the full model roster while Free Play is selected. */
export function FreePlayRoster({
  botSelected,
  botLimit,
  personaMode,
  onBotToggle,
  onUnlock,
}: {
  botSelected: boolean;
  botLimit: number;
  personaMode: boolean;
  onBotToggle: () => void;
  onUnlock: () => void;
}) {
  return (
    <div className="space-y-2">
      {botLimit > 0 && (
        <AiModelRow
          model={FREE_PLAY_WRITER_MODEL}
          selected={botSelected}
          detail="Your one AI rival. Writes every joke."
          onClick={onBotToggle}
        />
      )}

      {personaMode && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-edge bg-surface/80 p-3">
          <ModelIcon model={FREE_PLAY_WRITER_MODEL} size={24} className="shrink-0" />
          <p className="text-xs leading-relaxed text-ink-dim">
            <span className="font-semibold text-ink">{FREE_PLAY_WRITER_MODEL.name}</span> plays the
            persona you are all trying to charm. Free Play has no AI teammates or portraits.
          </p>
        </div>
      )}

      {!personaMode && (
        <div className="flex items-center gap-3 rounded-xl border border-teal/30 bg-teal-soft/40 px-3 py-2.5">
          <ModelIcon model={JEV_MODEL} size={22} className="shrink-0" />
          <p className="text-xs leading-relaxed text-ink-dim">
            <span className="font-semibold text-ink">{JEV_MODEL.name}</span> casts the bot&apos;s
            votes and reactions. A decision model, so judging is instant.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onUnlock}
        className="w-full flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-edge px-3 py-2.5 text-left text-xs text-ink-dim transition-colors cursor-pointer hover:border-edge-strong hover:text-ink"
      >
        <span className="flex items-center gap-2">
          <LockIcon />
          {LOCKED_MODEL_COUNT} more models{personaMode ? ", portraits" : ", the narrator"}, and up
          to a full AI lineup
        </span>
        <span className="shrink-0 font-semibold text-punch">Use password</span>
      </button>
    </div>
  );
}

/** A paid feature row that explains the lock and offers the way in. */
export function LockedFeature({
  label,
  description,
  onUnlock,
}: {
  label: string;
  description: string;
  onUnlock: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onUnlock}
      className="mb-6 w-full p-3 rounded-xl border-2 border-edge bg-surface/60 text-left flex items-center gap-3 cursor-pointer transition-colors hover:border-edge-strong"
    >
      <span className="flex h-6 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-ink-dim">
        <LockIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-dim">{label}</span>
        <span className="block text-xs text-ink-dim/60">{description}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-punch">Use password</span>
    </button>
  );
}
