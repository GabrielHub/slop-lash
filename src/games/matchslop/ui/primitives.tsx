"use client";

import type { ModeView, RoomInfo } from "@/room/context";
import { useReducedAfterMount } from "@/room/moment";
import { MATCHSLOP_PHOTO_PROMPT_ID, MATCHSLOP_PROFILE_PROMPTS } from "../config/game-config";
import { isLastMessage } from "../rules";
import { COPY } from "./copy";

export type MatchslopMode = ModeView<"MATCHSLOP">;
export type Persona = MatchslopMode["persona"];
export type ChatMessage = MatchslopMode["messages"][number];
export type Signal = NonNullable<MatchslopMode["signal"]>;
export type Round = NonNullable<MatchslopMode["round"]>;
export type Answer = Round["answers"][number];
export type Level = NonNullable<ChatMessage["level"]>;
export type Verdict = NonNullable<MatchslopMode["verdict"]>;

export function personaName(persona: Persona): string {
  return persona.profile?.displayName ?? "Your match";
}

/** Her latest reply and the one before it. */
export function personaTurn(messages: readonly ChatMessage[]): {
  latest: ChatMessage | undefined;
  previous: ChatMessage | undefined;
} {
  const personas = messages.filter((message) => message.speaker === "PERSONA");
  return { latest: personas.at(-1), previous: personas.at(-2) };
}

/** Her latest reply, if she has written one. */
export function latestPersona(messages: readonly ChatMessage[]): ChatMessage | undefined {
  return messages.findLast((message) => message.speaker === "PERSONA");
}

/** How she judged the line the room sent on `turn`; null until she replied (or for a stand-in). */
export function levelOfTurn(messages: readonly ChatMessage[], turn: number): Level | null {
  return (
    messages.find((message) => message.speaker === "PERSONA" && message.turn === turn)?.level ??
    null
  );
}

/** A follow-up round that is the last message (round 1 has its own game-start card). */
export function isLastMessageRound(room: RoomInfo): boolean {
  return room.round > 1 && isLastMessage(room.round, room.totalRounds);
}

/** One round-1 opener: a profile prompt, or her photo. */
export type OpenerCard = {
  id: string;
  prompt: string;
  answer: string | null;
  photo: string | null;
};

/** Round 1's openers: her profile prompts and, once there is a photo to talk about, her photo. */
export function openerCards(persona: Persona): OpenerCard[] {
  const cards: OpenerCard[] = (
    persona.profile?.prompts.slice(0, MATCHSLOP_PROFILE_PROMPTS) ?? []
  ).map((prompt) => ({ id: prompt.id, prompt: prompt.prompt, answer: prompt.answer, photo: null }));
  if (persona.portraitUrl) {
    cards.push({
      id: MATCHSLOP_PHOTO_PROMPT_ID,
      prompt: COPY.photo,
      answer: null,
      photo: persona.portraitUrl,
    });
  }
  return cards;
}

type IconProps = { size?: number | string; className?: string };

export function HeartIcon({ size = 24, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

/**
 * Three dots that bob while someone types. Sized by `dot` (any CSS length);
 * a static "…" under reduced motion.
 */
export function TypingDots({
  dot = "0.5rem",
  tone = "text-punch",
  className = "",
}: {
  dot?: string;
  /** The dots' colour, a text-colour token class. */
  tone?: string;
  className?: string;
}) {
  const reduced = useReducedAfterMount();
  if (reduced) {
    return (
      <span className={`font-bold leading-none ${tone} ${className}`}>
        <span aria-hidden="true">…</span>
        <span className="sr-only">typing</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center ${tone} ${className}`}
      style={{ gap: `calc(${dot} * 0.7)` }}
    >
      <span className="sr-only">typing</span>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          className="rounded-full bg-current"
          style={{
            width: dot,
            height: dot,
            animation: `ms-typing-dot 1.4s ease-in-out ${index * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
