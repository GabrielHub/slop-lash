"use client";

import { AiUsageBreakdown } from "@/components/ai-usage-breakdown";
import { Avatar } from "@/room/avatar";
import { useModeView, usePlayers, useRoom, type RoomView } from "@/room/context";
import { matchupOutcome, type StampKind } from "../outcomes";
import { roundMultiplier } from "../scoring";
import { plus, typeOfPlayer, votesLabel, type SlPrompt } from "./data";
import { formatPoints } from "@/lib/format";

const CHIP: Record<StampKind | "walkover", { label: string; tone: string }> = {
  slopped: { label: "Slopped", tone: "bg-punch/15 text-punch" },
  flawless: { label: "Flawless", tone: "bg-teal-soft text-teal" },
  tie: { label: "Tie", tone: "bg-gold-soft text-gold-ink" },
  noVotes: { label: "No votes", tone: "bg-raised text-ink-dim" },
  walkover: { label: "Walkover", tone: "bg-raised text-ink-dim" },
};

/**
 * The public recap's extra pages, under the settled finale: every matchup by
 * round with who wrote what and what it scored, then the game's AI spend.
 */
export function RecapMatchups({ usage }: { usage: RoomView["usage"] }) {
  const { rounds } = useModeView("SLOPLASH");
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-4 pb-12">
      <h2 className="font-display text-2xl font-bold text-ink">Every matchup</h2>
      {rounds.map((round) => {
        const prompts = round.prompts
          .filter((prompt) => prompt.order !== null)
          .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0));
        if (prompts.length === 0) return null;
        return (
          <div key={round.number} className="flex flex-col gap-3">
            <h3 className="text-lg text-ink-dim">
              Round {round.number} · ×{formatPoints(roundMultiplier(round.number))}
            </h3>
            <ul className="grid gap-3 md:grid-cols-2">
              {prompts.map((prompt) => (
                <MatchupCard key={prompt.id} prompt={prompt} round={round.number} />
              ))}
            </ul>
          </div>
        );
      })}
      {usage && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold text-ink">AI usage</h2>
          <AiUsageBreakdown usage={usage} />
        </div>
      )}
    </section>
  );
}

function MatchupCard({ prompt, round }: { prompt: SlPrompt; round: number }) {
  const { players } = useRoom().view;
  const { byId } = usePlayers();
  const outcome = matchupOutcome(prompt, round, typeOfPlayer(players));
  const chip =
    prompt.kind === "walkover" ? CHIP.walkover : outcome.stamp ? CHIP[outcome.stamp] : null;
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-edge bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-lg leading-snug text-ink-dim">{prompt.text}</p>
        {chip && (
          <span className={`shrink-0 rounded-full px-2 text-sm font-bold ${chip.tone}`}>
            {chip.label}
          </span>
        )}
      </div>
      {prompt.answers.map((answer) => {
        const author = byId(answer.playerId);
        const won = outcome.winnerAnswerId === answer.id;
        return (
          <div key={answer.id} className="flex items-start gap-2">
            {author && <Avatar name={author.name} modelId={author.modelId} size="1.5rem" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">{author?.name ?? "Someone"}</p>
              <p className={answer.forfeited ? "text-ink-dim" : "text-ink"}>
                {answer.forfeited ? "No answer" : answer.text}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {prompt.kind === "vote" && (
                <p className="text-sm text-ink-dim">
                  {votesLabel(outcome.score.votes[answer.id] ?? 0)}
                </p>
              )}
              <p className={`font-mono font-bold ${won ? "text-gold-ink" : "text-ink"}`}>
                {plus(answer.pointsEarned)}
              </p>
            </div>
          </div>
        );
      })}
    </li>
  );
}
