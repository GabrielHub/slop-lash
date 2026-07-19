"use client";

import { useEffect, useState } from "react";
import type {
  QuizslopExamAssignment,
  QuizslopExamDefenseTask,
  QuizslopExamPerson,
} from "./quizslop-exam-contracts";
import {
  AssignmentPair,
  ExamChoices,
  ExamHeading,
  ExamKicker,
  ExamPaper,
  LockButton,
} from "./quizslop-exam-shared";

export function PlayerBallot({
  title,
  hint,
  players,
  selectedId,
  abstained = false,
  locked = selectedId !== null,
  allowAbstain = false,
  busy,
  submitLabel,
  onSubmit,
}: {
  title: string;
  hint: string;
  players: QuizslopExamPerson[];
  selectedId: string | null;
  abstained?: boolean;
  locked?: boolean;
  allowAbstain?: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: (playerId: string | null) => void;
}) {
  const [selection, setSelection] = useState<string | null>(abstained ? "__ABSTAIN__" : selectedId);
  useEffect(() => setSelection(abstained ? "__ABSTAIN__" : selectedId), [abstained, selectedId]);

  return (
    <ExamPaper>
      <ExamKicker>Confidential ballot · Allegedly</ExamKicker>
      <h2
        className="mt-2 font-display text-3xl font-black uppercase leading-none"
        style={{ color: "var(--qs-ink)" }}
      >
        {title}
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: "var(--qs-ink-dim)" }}>
        {hint}
      </p>
      <div className="mt-6 grid gap-px sm:grid-cols-2" style={{ background: "var(--qs-edge)" }}>
        {players.map((player) => {
          const selected = selection === player.playerId;
          return (
            <button
              key={player.playerId}
              type="button"
              disabled={locked || busy}
              aria-pressed={selected}
              onClick={() => setSelection(player.playerId)}
              className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
              style={{
                background: selected ? "var(--qs-punch-soft)" : "var(--qs-surface)",
                color: "var(--qs-ink)",
              }}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full border-2"
                style={{
                  borderColor: selected ? "var(--qs-punch)" : "var(--qs-edge-strong)",
                  boxShadow: selected
                    ? "inset 0 0 0 4px var(--qs-surface), inset 0 0 0 12px var(--qs-punch)"
                    : "none",
                }}
                aria-hidden="true"
              />
              <span className="font-display text-lg font-black">{player.name}</span>
            </button>
          );
        })}
        {allowAbstain ? (
          <button
            type="button"
            disabled={locked || busy}
            aria-label="Suspend nobody"
            aria-pressed={selection === "__ABSTAIN__"}
            onClick={() => setSelection("__ABSTAIN__")}
            className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
            style={{
              background:
                selection === "__ABSTAIN__" ? "var(--qs-marquee-soft)" : "var(--qs-surface)",
              color: "var(--qs-ink)",
            }}
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full border-2"
              style={{
                borderColor:
                  selection === "__ABSTAIN__" ? "var(--qs-marquee)" : "var(--qs-edge-strong)",
              }}
              aria-hidden="true"
            />
            <span>
              <strong className="font-display text-lg font-black">Suspend nobody</strong>
              <span className="block text-xs" style={{ color: "var(--qs-ink-dim)" }}>
                Return the disciplinary stamp unused and emotionally unfulfilled.
              </span>
            </span>
          </button>
        ) : null}
      </div>
      <LockButton
        disabled={selection === null || locked}
        busy={busy}
        onClick={() => {
          if (selection !== null) onSubmit(selection === "__ABSTAIN__" ? null : selection);
        }}
      >
        {locked ? "Ballot already inside the machine" : submitLabel}
      </LockButton>
    </ExamPaper>
  );
}

export function QuestionSheet({
  assignment,
  mode,
  busy,
  onSubmit,
}: {
  assignment: QuizslopExamAssignment;
  mode: "SCRATCH" | "PROXY" | "GROUP";
  busy: boolean;
  onSubmit: (selectedIndex: number) => void;
}) {
  const lockedIndex =
    mode === "SCRATCH"
      ? assignment.scratchIndex
      : mode === "GROUP"
        ? assignment.groupVoteIndex
        : assignment.officialIndex;
  const locked =
    mode === "SCRATCH"
      ? assignment.scratchLocked
      : mode === "GROUP"
        ? assignment.groupVoteLocked
        : assignment.officialLocked;
  const headingId = `quizslop-${mode.toLowerCase()}-question-${assignment.id}`;
  const [selection, setSelection] = useState<number | null>(lockedIndex);
  useEffect(() => setSelection(lockedIndex), [assignment.id, lockedIndex, mode]);

  if (!assignment.prompt || !assignment.choices) {
    return (
      <ExamPaper>
        <ExamKicker>Secure materials unavailable</ExamKicker>
        <ExamHeading>The envelope is still sealed.</ExamHeading>
        <p className="mt-4 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
          Wait for the proctor. Do not attempt to absorb knowledge through the envelope.
        </p>
      </ExamPaper>
    );
  }

  const copy =
    mode === "SCRATCH"
      ? {
          kicker: `Private scratch work · ${assignment.topicLabel}`,
          instruction:
            "Answer privately. This trains your hidden difficulty ladder, not the class grade.",
          button: "Seal my scratch answer",
        }
      : mode === "GROUP"
        ? {
            kicker: `Emergency committee answer · ${assignment.topicLabel}`,
            instruction: `${assignment.suspendedProxyName ?? "The assigned proxy"} is suspended. Discuss this out loud, then cast your private committee vote. Strict majority files the official answer.`,
            button: "Submit committee ballot",
          }
        : {
            kicker: `Official proxy form · ${assignment.topicLabel}`,
            instruction: `Listen to ${assignment.candidate.name} explain their reasoning. You file the answer that changes the class grade. No pressure except all of it.`,
            button: "File the official answer",
          };

  return (
    <ExamPaper labelledBy={headingId}>
      <ExamKicker>{copy.kicker}</ExamKicker>
      {mode !== "SCRATCH" ? (
        <div className="mt-4">
          <AssignmentPair assignment={assignment} />
        </div>
      ) : null}
      <p
        className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.18em]"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        Question {assignment.questionNumber}
      </p>
      <h2
        id={headingId}
        className="mt-2 text-pretty font-display text-2xl font-black leading-tight sm:text-3xl"
        style={{ color: "var(--qs-ink)" }}
      >
        {assignment.prompt}
      </h2>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--qs-ink-dim)" }}>
        {copy.instruction}
      </p>
      <ExamChoices
        choices={assignment.choices}
        selectedIndex={selection}
        disabled={locked || busy}
        onSelect={setSelection}
      />
      <LockButton
        disabled={selection === null || locked}
        busy={busy}
        onClick={() => selection !== null && onSubmit(selection)}
      >
        {locked ? "Answer sealed" : copy.button}
      </LockButton>
    </ExamPaper>
  );
}

export function CandidateExplanationCard({ assignment }: { assignment: QuizslopExamAssignment }) {
  if (!assignment.prompt || !assignment.choices) return null;
  return (
    <ExamPaper>
      <ExamKicker>Your scratch sheet · Explain aloud</ExamKicker>
      <div className="mt-4">
        <AssignmentPair assignment={assignment} />
      </div>
      <p
        className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.18em]"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        Question {assignment.questionNumber} · {assignment.topicLabel}
      </p>
      <h2
        className="mt-2 text-pretty font-display text-2xl font-black leading-tight"
        style={{ color: "var(--qs-ink)" }}
      >
        {assignment.prompt}
      </h2>
      <ExamChoices
        choices={assignment.choices}
        selectedIndex={assignment.scratchIndex}
        disabled
        onSelect={() => undefined}
      />
      <p
        className="mt-5 border-l-4 px-3 py-2 text-sm leading-relaxed"
        style={{
          borderColor: "var(--qs-marquee)",
          background: "var(--qs-marquee-soft)",
          color: "var(--qs-ink)",
        }}
      >
        Explain why you chose this answer. {assignment.proxy?.name ?? "The committee"} controls the
        official form, so make the reasoning better than “I saw it somewhere.”
      </p>
    </ExamPaper>
  );
}

export function DefenseForm({
  task,
  busy,
  onSubmit,
}: {
  task: QuizslopExamDefenseTask;
  busy: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(task.submittedText ?? "");
  useEffect(() => setText(task.submittedText ?? ""), [task.assignmentId, task.submittedText]);
  const roleLabel = task.kind === "CANDIDATE" ? "Candidate statement" : "Proxy statement";
  return (
    <ExamPaper>
      <ExamKicker>{roleLabel} · Entered under mild duress</ExamKicker>
      <p
        className="mt-3 text-pretty font-display text-xl font-black leading-tight"
        style={{ color: "var(--qs-ink)" }}
      >
        {task.prompt}
      </p>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--qs-ink-dim)" }}>
        {task.kind === "CANDIDATE"
          ? `Explain your scratch reasoning. ${task.proxyName} must separately defend the official filing.`
          : `Explain why you filed the wrong official answer for ${task.candidateName}. “I am the Saboteur” is concise but strategically adventurous.`}
      </p>
      <label
        className="mt-5 block font-mono text-[9px] font-black uppercase tracking-[0.18em]"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        Statement for the record
        <textarea
          value={text}
          disabled={task.locked || busy}
          maxLength={280}
          rows={4}
          onChange={(event) => setText(event.target.value)}
          className="mt-2 block w-full resize-none border bg-transparent px-3 py-3 font-sans text-sm normal-case tracking-normal outline-none disabled:cursor-not-allowed disabled:opacity-70"
          style={{ borderColor: "var(--qs-edge-strong)", color: "var(--qs-ink)" }}
          placeholder="I selected it because..."
        />
      </label>
      <LockButton
        disabled={text.trim().length === 0 || task.locked}
        busy={busy}
        onClick={() => onSubmit(text.trim())}
      >
        {task.locked ? "Statement sealed" : "Submit oral defense"}
      </LockButton>
    </ExamPaper>
  );
}
