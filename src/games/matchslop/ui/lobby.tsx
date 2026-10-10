"use client";

import { motion } from "motion/react";
import { enter } from "@/lib/animations";
import { useModeView } from "@/room/context";
import { COPY } from "./copy";
import { PersonaFace } from "./strip";
import { HeartIcon, TypingDots } from "./primitives";

/**
 * The lobby's teaser for tonight's match: a blurred face and her tagline, no
 * name (the name is the Meet's reveal). One fixed 8rem row.
 */
export function MatchslopStageLobby() {
  const { persona } = useModeView("MATCHSLOP");
  const profile = persona.profile;
  return (
    <motion.div
      className="flex h-[8rem] items-center gap-6"
      variants={enter}
      initial="hidden"
      animate="visible"
    >
      {profile ? (
        <PersonaFace
          persona={persona}
          className="size-[7rem]"
          radius="50%"
          monogram="text-6xl"
          blur={16}
          layoutId={null}
        />
      ) : (
        <span className="grid size-[7rem] shrink-0 place-items-center rounded-full bg-punch/15 text-punch">
          <HeartIcon size="45%" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {profile ? (
          <>
            <p className="text-lg font-bold text-punch">{COPY.tonightsMatch}</p>
            {profile.tagline ? (
              <p className="line-clamp-2 font-display text-3xl font-bold leading-tight text-ink">
                {profile.tagline}
              </p>
            ) : (
              <p className="line-clamp-2 text-2xl leading-snug text-ink">{profile.bio}</p>
            )}
          </>
        ) : (
          <p className="flex items-center gap-3 text-2xl text-ink">
            {COPY.findingMatch}
            <TypingDots dot="0.5rem" />
          </p>
        )}
      </div>
    </motion.div>
  );
}
