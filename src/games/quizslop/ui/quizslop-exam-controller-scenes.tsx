import { motion } from "motion/react";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import type {
  QuizslopExamControllerActions,
  QuizslopExamControllerView,
} from "./quizslop-exam-contracts";
import { quizslopExamContentReady, quizslopExamPercent } from "./quizslop-exam-contracts";
import {
  ExamHeading,
  ExamKicker,
  ExamPaper,
  LobbyRoster,
  LockButton,
} from "./quizslop-exam-shared";

export function ControllerLobby({
  view,
  actions,
  busyAction,
}: {
  view: QuizslopExamControllerView;
  actions: QuizslopExamControllerActions;
  busyAction: string | null;
}) {
  const lobby = view.lobby;
  if (!lobby) return null;
  const contentReady = quizslopExamContentReady(lobby);
  const contentTitle =
    lobby.content.packStatus === "FALLBACK"
      ? "Reviewed catalog fallback"
      : lobby.content.source === "AI"
        ? "Fresh AI pack"
        : "Reviewed catalog";
  const contentCopy =
    lobby.content.packStatus === "PENDING"
      ? "The request is queued behind several smaller bureaucratic emergencies."
      : lobby.content.packStatus === "GENERATING"
        ? `${lobby.content.generatorModelName ?? "The selected model"} is writing the forms. A fixed verifier is standing nearby with a red pen.`
        : lobby.content.packStatus === "FALLBACK"
          ? "Fresh questions missed a safety or quality gate, so the reviewed catalog took over. The exam remains fully playable."
          : lobby.content.packStatus === "FAILED"
            ? "Generation and fallback persistence both failed. The copier has achieved sentience and chosen violence."
            : lobby.content.source === "AI"
              ? `${lobby.content.generatorModelName ?? "The selected model"} wrote the forms. A fixed verifier checked its little robot homework.`
              : "Human-reviewed questions, pre-sharpened pencils, no live model calls.";
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)] lg:items-start">
      <section className="pt-4">
        <ExamKicker>Mandatory group assessment</ExamKicker>
        <ExamHeading size="display">Pass together. Fail mysteriously.</ExamHeading>
        <p
          className="mt-5 max-w-2xl text-pretty text-base leading-relaxed sm:text-lg"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Every section gives everyone a private question. Then somebody else files your official
          answer. One classmate is secretly paid in incorrect paperwork.
        </p>
        <dl
          className="mt-8 grid grid-cols-3 border-y py-4"
          style={{ borderColor: "var(--qs-edge)" }}
        >
          <div>
            <dt
              className="font-mono text-[9px] font-black uppercase tracking-wider"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              Sections
            </dt>
            <dd className="mt-1 font-display text-3xl font-black">
              {view.totalSections > 0 ? view.totalSections : "3–6"}
            </dd>
          </div>
          <div>
            <dt
              className="font-mono text-[9px] font-black uppercase tracking-wider"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              Questions
            </dt>
            <dd className="mt-1 font-display text-3xl font-black">
              {view.totalSections > 0 ? view.roster.length * view.totalSections : "18–24"}
            </dd>
          </div>
          <div>
            <dt
              className="font-mono text-[9px] font-black uppercase tracking-wider"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              Pass line
            </dt>
            <dd className="mt-1 font-display text-3xl font-black">
              {view.score.passingScorePercent}%
            </dd>
          </div>
        </dl>
        {view.totalSections === 0 ? (
          <p
            className="mt-2 font-mono text-[9px] font-black uppercase tracking-wider"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Final length is based on attendance when the roster freezes.
          </p>
        ) : null}
      </section>
      <div className="space-y-5">
        <ExamPaper>
          <ExamKicker>Exam materials</ExamKicker>
          <p
            className="mt-2 font-display text-2xl font-black uppercase"
            style={{ color: "var(--qs-ink)" }}
          >
            {contentTitle}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
            {contentCopy}
          </p>
          <p
            className="mt-5 border-y py-3 font-mono text-[10px] font-black uppercase tracking-widest"
            style={{
              borderColor: "var(--qs-edge)",
              color: contentReady ? "var(--qs-win)" : "var(--qs-punch)",
            }}
          >
            Pack status · {lobby.content.packStatus.toLowerCase().replace("_", " ")}
          </p>
          <ol className="mt-5 space-y-3 text-sm" style={{ color: "var(--qs-ink-dim)" }}>
            <li>
              <strong style={{ color: "var(--qs-ink)" }}>1.</strong> Answer your own scratch
              question.
            </li>
            <li>
              <strong style={{ color: "var(--qs-ink)" }}>2.</strong> Explain it while your Proxy
              controls the official form.
            </li>
            <li>
              <strong style={{ color: "var(--qs-ink)" }}>3.</strong> Suspend one suspicious Proxy at
              midpoint.
            </li>
            <li>
              <strong style={{ color: "var(--qs-ink)" }}>4.</strong> Name the Saboteur and try to
              graduate.
            </li>
          </ol>
          {view.me.isHost ? (
            <LockButton
              disabled={!lobby.canStart || !contentReady || busyAction !== null}
              busy={busyAction === "start"}
              onClick={actions.start}
            >
              {lobby.content.packStatus === "PENDING" || lobby.content.packStatus === "GENERATING"
                ? "Forms still in the machine"
                : "Begin standardized suffering"}
            </LockButton>
          ) : (
            <p
              className="mt-6 text-center font-mono text-[10px] font-black uppercase tracking-widest"
              style={{ color: "var(--qs-ink-dim)" }}
            >
              Waiting for the host to distribute emotional damage
            </p>
          )}
        </ExamPaper>
        <ExamPaper>
          <ExamKicker>Candidate register</ExamKicker>
          <LobbyRoster
            players={view.roster}
            canRemove={view.me.isHost}
            hostPlayerId={view.me.playerId}
            busyPlayerId={busyAction?.startsWith("remove:") ? busyAction.slice(7) : null}
            disabled={busyAction !== null && !busyAction.startsWith("remove:")}
            onRemove={actions.removePlayer}
          />
        </ExamPaper>
      </div>
    </div>
  );
}

export function RoleReveal({ view }: { view: QuizslopExamControllerView }) {
  const role = view.role;
  if (!role) return null;
  const saboteur = role.kind === "SABOTEUR";
  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-3xl py-4 text-center"
    >
      <motion.div variants={fadeInUp}>
        <ExamKicker>Private appointment letter</ExamKicker>
      </motion.div>
      <motion.p
        variants={fadeInUp}
        className="mt-5 font-mono text-xs font-black uppercase tracking-[0.26em]"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        Your assigned role is
      </motion.p>
      <motion.h2
        variants={fadeInUp}
        className="mt-2 text-balance font-display text-6xl font-black uppercase leading-none tracking-[-0.05em] sm:text-8xl"
        style={{ color: saboteur ? "var(--qs-punch)" : "var(--qs-win)" }}
      >
        {saboteur ? "Saboteur" : "Class Member"}
      </motion.h2>
      <motion.div
        variants={fadeInUp}
        className="mx-auto mt-7 max-w-xl border-y py-6"
        style={{ borderColor: "var(--qs-edge)" }}
      >
        <p className="text-pretty text-base leading-relaxed" style={{ color: "var(--qs-ink)" }}>
          {saboteur
            ? "Keep scratch work honest. Each wrong Proxy filing deducts 1; overriding a correct Candidate scratch answer adds a 1-point bonus. A correct final majority erases every deduction, so lie with the composure of a copier-sales executive."
            : "Help the class clear 70%. Explain your scratch reasoning and watch suspicious Proxy edits. A correct final majority names the Saboteur and erases every deduction; confidence remains legally distinct from a source citation."}
        </p>
      </motion.div>
      <motion.p
        variants={fadeInUp}
        className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.22em]"
        style={{ color: "var(--qs-punch)" }}
      >
        Keep this screen private · The proctor is nosy enough already
      </motion.p>
    </motion.section>
  );
}

export function PassiveController({
  kicker,
  title,
  text,
}: {
  kicker: string;
  title: string;
  text: string;
}) {
  return (
    <section
      className="flex min-h-[22rem] flex-col justify-center border-y py-10 text-center"
      style={{ borderColor: "var(--qs-edge)" }}
    >
      <ExamKicker>{kicker}</ExamKicker>
      <div className="mt-3">
        <ExamHeading>{title}</ExamHeading>
      </div>
      <p
        className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed sm:text-base"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        {text}
      </p>
    </section>
  );
}

export function ControllerFinal({ view }: { view: QuizslopExamControllerView }) {
  const final = view.final;
  if (!final) return null;
  const percent = quizslopExamPercent(final.adjustedCorrect, final.totalQuestions);
  return (
    <section className="mx-auto max-w-4xl py-3 text-center">
      <ExamKicker>Official transcript · Regrettably permanent</ExamKicker>
      <h2
        className="mt-3 font-display text-7xl font-black uppercase leading-none tracking-[-0.05em] sm:text-9xl"
        style={{ color: final.passed ? "var(--qs-win)" : "var(--qs-punch)" }}
      >
        {final.passed ? "Pass" : "Fail"}
      </h2>
      <p
        className="mt-3 font-display text-3xl font-black tabular-nums"
        style={{ color: "var(--qs-ink)" }}
      >
        {percent}%
      </p>
      <p
        className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed"
        style={{ color: "var(--qs-ink-dim)" }}
      >
        {final.identified
          ? `${final.saboteurName} was correctly identified. The integrity office removed ${final.sabotagePoints} deduction${final.sabotagePoints === 1 ? "" : "s"}, after locating the correct rubber stamp.`
          : `${final.saboteurName} survives the hearing with plausible deniability and an alarming amount of incorrect paperwork.`}
      </p>
      <div
        className="mt-8 grid grid-cols-3 border-y py-5"
        style={{ borderColor: "var(--qs-edge)" }}
      >
        <div>
          <p
            className="font-mono text-[9px] font-black uppercase tracking-wider"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Raw correct
          </p>
          <p className="mt-1 font-display text-3xl font-black">
            {final.rawCorrect}/{final.totalQuestions}
          </p>
        </div>
        <div>
          <p
            className="font-mono text-[9px] font-black uppercase tracking-wider"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Deductions
          </p>
          <p className="mt-1 font-display text-3xl font-black">
            {final.deductionsRemoved ? "Void" : `-${final.sabotagePoints}`}
          </p>
        </div>
        <div>
          <p
            className="font-mono text-[9px] font-black uppercase tracking-wider"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Pass line
          </p>
          <p className="mt-1 font-display text-3xl font-black">{final.passingScorePercent}%</p>
        </div>
      </div>
    </section>
  );
}
