"use client";

import { AnimatePresence, motion } from "motion/react";
import { fadeInUp, phaseTransition, staggerContainer } from "@/lib/animations";
import type {
  QuizslopExamPublicAssignment,
  QuizslopExamStageActions,
  QuizslopExamStageView,
} from "./quizslop-exam-contracts";
import { quizslopExamContentReady, quizslopExamPercent } from "./quizslop-exam-contracts";
import {
  AssignmentPair,
  ExamHeading,
  ExamKicker,
  ExamPaper,
  ExamRule,
  ExamScoreLine,
  LobbyRoster,
  LockButton,
  ProctorTape,
  ReceiptSheet,
} from "./quizslop-exam-shared";

interface QuizslopExamStageContentProps {
  view: QuizslopExamStageView;
  actions: QuizslopExamStageActions;
  busyAction: string | null;
}

function unexpectedPhase(phase: never): never {
  throw new Error(`Unhandled QuizSlop exam stage phase: ${String(phase)}`);
}

function StageHeader({ view }: { view: QuizslopExamStageView }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
      <div>
        <ExamKicker>
          Live examination · Section {Math.max(0, view.sectionNumber)} of{" "}
          {view.totalSections || "—"}
        </ExamKicker>
        <p
          className="mt-2 font-display text-2xl font-black uppercase tracking-tight"
          style={{ color: "var(--qs-ink)" }}
        >
          S.L.O.P.{" "}
          <span
            className="font-mono text-xs tracking-[0.18em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Standardized Learning &amp; Occupational Proficiency
          </span>
        </p>
      </div>
      <ExamScoreLine score={view.score} />
    </div>
  );
}

function StageLobby({
  view,
  actions,
  busyAction,
}: {
  view: QuizslopExamStageView;
  actions: QuizslopExamStageActions;
  busyAction: string | null;
}) {
  const lobby = view.lobby;
  if (!lobby) return null;
  const contentReady = quizslopExamContentReady(lobby);
  return (
    <div className="grid min-h-[66svh] gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(21rem,0.8fr)] lg:items-center">
      <section>
        <ExamKicker>Room {view.roomCode} · Admissions open</ExamKicker>
        <ExamHeading size="display">The group project has an enemy within.</ExamHeading>
        <p
          className="mt-5 max-w-3xl text-pretty text-lg leading-relaxed"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Answer strange questions. Hand every official answer to somebody else. Pass together
          before one secret Saboteur turns the transcript into modern art.
        </p>
        <div
          className="mt-8 flex flex-wrap gap-x-7 gap-y-3 border-y py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em]"
          style={{ borderColor: "var(--qs-edge)", color: "var(--qs-ink-dim)" }}
        >
          <span>{view.totalSections > 0 ? view.totalSections : "3–6"} sections</span>
          <span>
            {view.totalSections > 0 ? view.roster.length * view.totalSections : "18–24"} questions
          </span>
          {view.totalSections === 0 ? <span>Based on final attendance</span> : null}
          <span>{view.score.passingScorePercent}% to pass</span>
          <span>
            {lobby.content.packStatus === "FALLBACK"
              ? "Reviewed catalog fallback"
              : lobby.content.source === "AI"
                ? `AI pack · ${lobby.content.generatorModelName ?? "selected model"}`
                : "Reviewed catalog"}
          </span>
        </div>
      </section>
      <ExamPaper>
        <div className="flex items-center justify-between gap-3">
          <ExamKicker>Candidate register</ExamKicker>
          <span
            className="font-mono text-[9px] font-black uppercase tracking-wider"
            style={{ color: contentReady ? "var(--qs-win)" : "var(--qs-punch)" }}
          >
            Pack {lobby.content.packStatus.toLowerCase().replace("_", " ")}
          </span>
        </div>
        <LobbyRoster
          players={view.roster}
          canRemove={view.me.isHost}
          hostPlayerId={view.me.playerId}
          busyPlayerId={busyAction?.startsWith("remove:") ? busyAction.slice(7) : null}
          disabled={busyAction !== null && !busyAction.startsWith("remove:")}
          onRemove={actions.removePlayer}
        />
        {view.me.isHost ? (
          <LockButton
            disabled={!lobby.canStart || !contentReady || busyAction !== null}
            busy={busyAction === "start"}
            onClick={actions.start}
          >
            {lobby.content.packStatus === "PENDING" || lobby.content.packStatus === "GENERATING"
              ? "Forms still in the machine"
              : "Distribute the forms"}
          </LockButton>
        ) : null}
      </ExamPaper>
    </div>
  );
}

function AssignmentLedger({ assignments }: { assignments: QuizslopExamPublicAssignment[] }) {
  return (
    <motion.ol
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mt-7 grid gap-px border sm:grid-cols-2"
      style={{ borderColor: "var(--qs-edge)", background: "var(--qs-edge)" }}
    >
      {assignments.map((assignment) => (
        <motion.li
          key={assignment.id}
          variants={fadeInUp}
          className="relative bg-[var(--qs-surface)] px-4 py-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p
              className="font-mono text-[9px] font-black uppercase tracking-[0.18em]"
              style={{ color: "var(--qs-punch)" }}
            >
              Q{assignment.questionNumber} · {assignment.topicLabel}
            </p>
            <span
              className="font-mono text-[9px] font-black uppercase tracking-wider"
              style={{ color: assignment.officialLocked ? "var(--qs-win)" : "var(--qs-ink-dim)" }}
            >
              {assignment.officialLocked ? "filed" : assignment.scratchLocked ? "drafted" : "blank"}
            </span>
          </div>
          <div className="mt-3">
            <AssignmentPair assignment={assignment} />
          </div>
          {assignment.proxyMode === "GROUP_VOTE" ? (
            <p
              className="mt-3 border-l-2 pl-3 text-xs"
              style={{ borderColor: "var(--qs-punch)", color: "var(--qs-ink-dim)" }}
            >
              {assignment.suspendedProxyName} is suspended. The official answer belongs to the
              committee, a sentence nobody has ever regretted.
            </p>
          ) : null}
        </motion.li>
      ))}
    </motion.ol>
  );
}

function StageProgress({ locked, total, label }: { locked: number; total: number; label: string }) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (locked / total) * 100)) : 0;
  return (
    <section className="mx-auto flex min-h-[50svh] w-full max-w-5xl flex-col justify-center text-center">
      <ExamKicker>{label}</ExamKicker>
      <p
        className="mt-4 font-display text-8xl font-black tabular-nums tracking-[-0.06em] sm:text-9xl"
        style={{ color: "var(--qs-ink)" }}
      >
        {locked}
        <span className="text-4xl" style={{ color: "var(--qs-ink-dim)" }}>
          /{total}
        </span>
      </p>
      <div
        className="mx-auto mt-7 h-4 w-full max-w-3xl border p-0.5"
        style={{ borderColor: "var(--qs-edge-strong)", background: "var(--qs-raised)" }}
      >
        <motion.div
          className="h-full origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: percent / 100 }}
          transition={{ type: "spring", stiffness: 160, damping: 24 }}
          style={{ background: "var(--qs-punch)" }}
        />
      </div>
    </section>
  );
}

function StageFinal({ view }: { view: QuizslopExamStageView }) {
  const final = view.final;
  if (!final) return null;
  const percent = quizslopExamPercent(final.adjustedCorrect, final.totalQuestions);
  return (
    <section className="grid min-h-[64svh] gap-9 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] lg:items-center">
      <div>
        <ExamKicker>Final standardized transcript</ExamKicker>
        <h2
          className="mt-2 font-display text-[clamp(5rem,17vw,13rem)] font-black uppercase leading-[0.72] tracking-[-0.07em]"
          style={{ color: final.passed ? "var(--qs-win)" : "var(--qs-punch)" }}
        >
          {final.passed ? "Pass" : "Fail"}
        </h2>
        <p
          className="mt-8 max-w-3xl text-pretty text-xl leading-relaxed"
          style={{ color: "var(--qs-ink)" }}
        >
          {final.identified
            ? `The class identified ${final.saboteurName}. ${final.sabotagePoints} integrity deduction${final.sabotagePoints === 1 ? " was" : "s were"} removed from the transcript.`
            : `${final.saboteurName} was the Saboteur. The hearing missed them, so the deductions remain with the adhesive strength of a government sticker.`}
        </p>
      </div>
      <ExamPaper>
        <ExamKicker>Grade calculation</ExamKicker>
        <p
          className="mt-3 font-display text-7xl font-black tabular-nums tracking-[-0.05em]"
          style={{ color: "var(--qs-ink)" }}
        >
          {percent}%
        </p>
        <dl className="mt-6 divide-y" style={{ borderColor: "var(--qs-edge)" }}>
          <div className="flex justify-between py-3">
            <dt className="text-sm" style={{ color: "var(--qs-ink-dim)" }}>
              Raw correct
            </dt>
            <dd className="font-mono font-black">
              {final.rawCorrect}/{final.totalQuestions}
            </dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-sm" style={{ color: "var(--qs-ink-dim)" }}>
              Sabotage deductions
            </dt>
            <dd className="font-mono font-black">
              {final.deductionsRemoved ? "REMOVED" : `-${final.sabotagePoints}`}
            </dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-sm" style={{ color: "var(--qs-ink-dim)" }}>
              Required grade
            </dt>
            <dd className="font-mono font-black">{final.passingScorePercent}%</dd>
          </div>
        </dl>
        <ExamRule className="mt-5" />
        <p
          className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.16em]"
          style={{ color: final.identified ? "var(--qs-win)" : "var(--qs-punch)" }}
        >
          Academic integrity hearing ·{" "}
          {final.identified ? "correct majority" : "incorrect or split"}
        </p>
      </ExamPaper>
    </section>
  );
}

function StageMessage({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <section
      className="flex min-h-[56svh] flex-col justify-center border-y py-12 text-center"
      style={{ borderColor: "var(--qs-edge)" }}
    >
      <ExamKicker>{kicker}</ExamKicker>
      <div className="mx-auto mt-3 max-w-5xl">
        <ExamHeading size="display">{title}</ExamHeading>
      </div>
      <p
        className="mx-auto mt-6 max-w-3xl text-pretty text-base leading-relaxed sm:text-xl"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        {text}
      </p>
    </section>
  );
}

export function QuizslopExamStageContent({
  view,
  actions,
  busyAction,
}: QuizslopExamStageContentProps) {
  const progress = view.assignmentProgress ?? { locked: 0, total: view.assignments.length };
  let content: React.ReactNode;

  switch (view.phase) {
    case "LOBBY_SETUP":
      content = <StageLobby view={view} actions={actions} busyAction={busyAction} />;
      break;
    case "SECTION_INTRO":
      content = (
        <section className="py-4">
          <ExamKicker>
            {view.sectionNumber === 1
              ? "Role letters delivered privately"
              : `Section ${view.sectionNumber} seating chart`}
          </ExamKicker>
          <ExamHeading>
            {view.sectionNumber === 1
              ? "One of you works for the wrong answer key."
              : "New forms. Rotated Proxies."}
          </ExamHeading>
          <p
            className="mt-4 max-w-3xl text-pretty text-base leading-relaxed"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            {view.sectionNumber === 1
              ? "Every player is both a Candidate and somebody else’s Proxy. Your role never changes. Your plausible deniability probably will."
              : "Each Candidate gets a different topic. Each Proxy controls a different official answer. Talk clearly; accuse tastefully."}
          </p>
          <AssignmentLedger assignments={view.assignments} />
        </section>
      );
      break;
    case "SCRATCH":
      content = (
        <div>
          <StageProgress
            locked={progress.locked}
            total={progress.total}
            label="Private scratch answers sealed"
          />
          <p
            className="-mt-8 text-center font-mono text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            No peeking · No coaching · No licking the answer sheet for knowledge
          </p>
        </div>
      );
      break;
    case "PROXY_ANSWER":
      content = (
        <section className="py-3">
          <ExamKicker>Official answer handoff</ExamKicker>
          <ExamHeading>Candidate explains. Proxy decides.</ExamHeading>
          <p className="mt-4 max-w-3xl text-pretty" style={{ color: "var(--qs-ink-dim)" }}>
            The Candidate talks through the question. The Proxy files the answer that affects the
            class grade. This is either teamwork or a very small hostile takeover.
          </p>
          <AssignmentLedger assignments={view.assignments} />
          <div className="mt-6">
            <StageProgress
              locked={progress.locked}
              total={progress.total}
              label="Official forms filed"
            />
          </div>
        </section>
      );
      break;
    case "ORAL_DEFENSE":
      content =
        view.receipts.length > 0 ? (
          <section>
            <ExamKicker>Complete section receipt ledger</ExamKicker>
            <ExamHeading>Every filing is now public.</ExamHeading>
            <p className="mt-4 max-w-3xl text-pretty" style={{ color: "var(--qs-ink-dim)" }}>
              Wrong official answers require statements from both assigned people. A changed answer
              is evidence of a decision, not proof of a hidden role.
            </p>
            <div className="mt-7 grid gap-6 xl:grid-cols-2 xl:items-start">
              {view.receipts.map((receipt) => (
                <div
                  key={receipt.assignmentId}
                  className={receipt.officialCorrect ? "opacity-90" : "border-2 p-1"}
                  style={receipt.officialCorrect ? undefined : { borderColor: "var(--qs-punch)" }}
                >
                  <ReceiptSheet receipt={receipt} compact />
                </div>
              ))}
            </div>
          </section>
        ) : (
          <StageMessage
            kicker="Receipt audit"
            title="Red pens deployed."
            text="Scratch work and official filings are being matched by people who definitely understand the copier."
          />
        );
      break;
    case "SECTION_RESULTS":
      content = (
        <section className="mx-auto flex min-h-[56svh] max-w-5xl flex-col justify-center">
          <ExamKicker>Section {view.sectionNumber} grade posted</ExamKicker>
          <ExamHeading>Raw grade posted. Integrity file sealed.</ExamHeading>
          <div className="mt-9">
            <ExamScoreLine score={view.score} />
          </div>
        </section>
      );
      break;
    case "PROCTOR_REVIEW_VOTE":
      content = (
        <section className="mx-auto flex min-h-[56svh] max-w-5xl flex-col justify-center text-center">
          <ExamKicker>Midpoint Proctor Review</ExamKicker>
          <ExamHeading size="display">Suspend one Proxy.</ExamHeading>
          <p
            className="mx-auto mt-5 max-w-3xl text-pretty text-lg leading-relaxed"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Vote privately on your phone. A strict majority confiscates one player’s Proxy
            privileges next section. Wrongful suspension comes with no refund, coupon, or apology.
          </p>
          <p
            className="mt-8 font-display text-7xl font-black tabular-nums"
            style={{ color: "var(--qs-ink)" }}
          >
            {view.proctorReview?.votesCast ?? 0}
            <span className="text-3xl" style={{ color: "var(--qs-ink-dim)" }}>
              /{view.proctorReview?.votersTotal ?? 0}
            </span>
          </p>
        </section>
      );
      break;
    case "PROCTOR_REVIEW_RESULT":
      content = view.suspension ? (
        <section className="flex min-h-[55svh] flex-col justify-center">
          <ExamKicker>Disciplinary bulletin</ExamKicker>
          <div className="mt-7">
            <ProctorTape name={view.suspension.name} />
          </div>
          <p
            className="mx-auto mt-8 max-w-3xl text-center text-lg leading-relaxed"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Next section, their Proxy assignment becomes a private class vote. They remain a
            Candidate, because even bureaucratic vengeance has forms.
          </p>
        </section>
      ) : (
        <StageMessage
          kicker="Disciplinary bulletin"
          title="No strict majority."
          text="Nobody is suspended. The Saboteur—or a dramatically innocent person—continues to hold a pen."
        />
      );
      break;
    case "FINAL_ACCUSATION":
      content = (
        <section className="mx-auto flex min-h-[58svh] max-w-5xl flex-col justify-center text-center">
          <ExamKicker>Academic Integrity Hearing</ExamKicker>
          <ExamHeading size="display">Name the Saboteur.</ExamHeading>
          <p
            className="mx-auto mt-6 max-w-3xl text-pretty text-lg leading-relaxed"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            A correct strict majority removes every sabotage deduction before the final grade. A
            split vote leaves the transcript cursed. Vote privately; stare publicly.
          </p>
          <p
            className="mt-8 font-display text-7xl font-black tabular-nums"
            style={{ color: "var(--qs-ink)" }}
          >
            {view.hearing?.votesCast ?? 0}
            <span className="text-3xl" style={{ color: "var(--qs-ink-dim)" }}>
              /{view.hearing?.votersTotal ?? 0}
            </span>
          </p>
        </section>
      );
      break;
    case "FINAL_RESULTS":
      content = <StageFinal view={view} />;
      break;
    default:
      return unexpectedPhase(view.phase);
  }

  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-8 sm:py-8 lg:px-10">
      {view.phase !== "LOBBY_SETUP" && view.phase !== "FINAL_RESULTS" ? (
        <StageHeader view={view} />
      ) : null}
      {view.suspension &&
      view.phase !== "PROCTOR_REVIEW_RESULT" &&
      view.phase !== "FINAL_RESULTS" ? (
        <div className="mt-5">
          <ProctorTape name={view.suspension.name} />
        </div>
      ) : null}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${view.phase}:${view.sectionNumber}`}
          variants={phaseTransition}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="mt-6"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
