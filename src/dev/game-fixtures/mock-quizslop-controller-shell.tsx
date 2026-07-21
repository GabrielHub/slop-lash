"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  QuizslopControllerShell,
  type QuizslopControllerShellFixture,
} from "@/games/quizslop/ui/quizslop-controller-shell";
import { MockQuizslopNavBar, useQuizslopFixtureBeats } from "./mock-quizslop-game-shell";
import {
  mockChooseCatalogTopicResult,
  mockInitiateDisputeResult,
  QUIZSLOP_FIXTURE_PLAYER_KEYS,
  type QuizslopFixturePlayerKey,
} from "./mock-quizslop-state";

function asPlayerKey(raw: string | null): QuizslopFixturePlayerKey {
  return QUIZSLOP_FIXTURE_PLAYER_KEYS.find((key) => key === raw) ?? "P1";
}

export function MockQuizslopControllerShell() {
  const searchParams = useSearchParams();
  const playerKey = asPlayerKey(searchParams.get("player"));
  const { beats, beatIndex, setBeatIndex, stepBeat } = useQuizslopFixtureBeats();
  const beat = beats[beatIndex] ?? beats[0];
  if (!beat) return null;

  const fixture: QuizslopControllerShellFixture = {
    view: beat.controllers[playerKey],
    start: () => stepBeat(1),
    advance: () => stepBeat(1),
    chooseCatalogTopic: (catalogTopicId) => {
      const result = mockChooseCatalogTopicResult(catalogTopicId);
      if (result.kind === "CONFIRMED") stepBeat(1);
      return result;
    },
    castHouseVote: () => stepBeat(1),
    submitCall: () => stepBeat(1),
    lockAnswer: () => stepBeat(1),
    initiateDispute: (questionId) => {
      const result = mockInitiateDisputeResult(questionId);
      if (result.kind === "OPENED") stepBeat(1);
      return result;
    },
    castDisputeVote: () => stepBeat(1),
  };

  return (
    <div className="flex h-svh flex-col">
      <MockQuizslopNavBar
        beat={beat}
        beatIndex={beatIndex}
        beatCount={beats.length}
        stepBeat={stepBeat}
        setBeatIndex={setBeatIndex}
        viewLabel={`CONTROLLER ${playerKey}`}
        switcher={
          <span className="flex items-center gap-1">
            {QUIZSLOP_FIXTURE_PLAYER_KEYS.map((key) => (
              <Link
                key={key}
                href={`/dev/ui/quizslop-prototype/controller?player=${key}&beat=${beatIndex}`}
                className={
                  key === playerKey
                    ? "rounded-md border border-teal bg-teal/20 px-2 py-1 font-bold text-teal"
                    : "rounded-md border border-teal/40 bg-teal/10 px-2 py-1 text-teal hover:border-teal hover:bg-teal/15"
                }
              >
                {key}
              </Link>
            ))}
            <Link
              href={`/dev/ui/quizslop-prototype?beat=${beatIndex}`}
              target="_blank"
              className="rounded-md border border-gold/40 bg-gold-soft px-2 py-1 text-gold hover:border-gold"
            >
              Stage
            </Link>
          </span>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto min-h-full w-full max-w-md border-x border-edge">
          <QuizslopControllerShell code="mock-quizslop" fixture={fixture} />
        </div>
      </div>
    </div>
  );
}
