"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { phaseTransition } from "@/lib/animations";
import type {
  QuizslopExamControllerActions,
  QuizslopExamControllerView,
} from "./quizslop-exam-contracts";
import {
  CandidateExplanationCard,
  DefenseForm,
  PlayerBallot,
  QuestionSheet,
} from "./quizslop-exam-controller-inputs";
import {
  ControllerFinal,
  ControllerLobby,
  PassiveController,
  RoleReveal,
} from "./quizslop-exam-controller-scenes";
import {
  ExamHeading,
  ExamKicker,
  ExamRule,
  ExamScoreLine,
  ProctorTape,
  ReceiptSheet,
} from "./quizslop-exam-shared";

interface QuizslopExamControllerContentProps {
  view: QuizslopExamControllerView;
  actions: QuizslopExamControllerActions;
  busyAction: string | null;
}

function unexpectedPhase(phase: never): never {
  throw new Error(`Unhandled QuizSlop exam controller phase: ${String(phase)}`);
}

function ControllerChrome({ view }: { view: QuizslopExamControllerView }) {
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_18rem] lg:items-end">
      <div>
        <ExamKicker>
          S.L.O.P. examination · Section {Math.max(view.sectionNumber, 0)} of{" "}
          {view.totalSections || "—"}
        </ExamKicker>
        <p
          className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--qs-ink-dim)" }}
        >
          Standardized Learning &amp; Occupational Proficiency · Room {view.roomCode}
        </p>
      </div>
      <ExamScoreLine score={view.score} />
    </div>
  );
}

export function QuizslopExamControllerContent({
  view,
  actions,
  busyAction,
}: QuizslopExamControllerContentProps) {
  const candidateAssignment = view.candidateAssignment;
  const proxyAssignment = view.proxyAssignment;
  const groupVoteAssignment = view.groupVoteAssignment;
  let content: ReactNode;

  switch (view.phase) {
    case "LOBBY_SETUP":
      content = <ControllerLobby view={view} actions={actions} busyAction={busyAction} />;
      break;
    case "SECTION_INTRO":
      content =
        view.sectionNumber === 1 && view.role ? (
          <RoleReveal view={view} />
        ) : (
          <section className="py-5">
            <ExamKicker>Section {view.sectionNumber} materials</ExamKicker>
            <ExamHeading>New topic. New Proxy. Same suspicious class.</ExamHeading>
            <p className="mt-5 max-w-2xl text-pretty" style={{ color: "var(--qs-ink-dim)" }}>
              Your next question is sealed. Pairings rotate every section because the testing
              authority briefly discovered fairness.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {view.sectionTopicLabels.map((topic) => (
                <span
                  key={topic}
                  className="border px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider"
                  style={{ borderColor: "var(--qs-edge-strong)", color: "var(--qs-ink)" }}
                >
                  {topic}
                </span>
              ))}
            </div>
          </section>
        );
      break;
    case "SCRATCH":
      content = candidateAssignment ? (
        <QuestionSheet
          assignment={candidateAssignment}
          mode="SCRATCH"
          busy={busyAction === "scratch"}
          onSubmit={actions.submitScratch}
        />
      ) : (
        <PassiveController
          kicker="Scratch period"
          title="The exam misplaced your paper."
          text="You are not assigned a Candidate question. Wait while the proctor investigates the printer, society’s most reliable adversary."
        />
      );
      break;
    case "PROXY_ANSWER":
      content =
        candidateAssignment || proxyAssignment || groupVoteAssignment ? (
          <div className="space-y-6">
            {candidateAssignment ? (
              <CandidateExplanationCard assignment={candidateAssignment} />
            ) : null}
            <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
              {proxyAssignment ? (
                <QuestionSheet
                  assignment={proxyAssignment}
                  mode="PROXY"
                  busy={busyAction === "proxy"}
                  onSubmit={actions.submitProxyAnswer}
                />
              ) : (
                <PassiveController
                  kicker="Proxy privileges suspended"
                  title="Your official pen is in custody."
                  text="You still explain your Candidate reasoning. Your former Proxy assignment is being answered by committee, which should feel both safer and much worse."
                />
              )}
              {groupVoteAssignment ? (
                <QuestionSheet
                  assignment={groupVoteAssignment}
                  mode="GROUP"
                  busy={busyAction === "group"}
                  onSubmit={actions.submitGroupAnswer}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <PassiveController
            kicker="Official answer period"
            title="Explain your answer out loud."
            text="Your Proxy has the form. State your reasoning clearly, then observe whether they nod like a teammate or like someone hiding a tiny evil clipboard."
          />
        );
      break;
    case "ORAL_DEFENSE":
      content =
        view.receipts.length > 0 || view.defenses.length > 0 ? (
          <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
            {view.defenses.map((task) => (
              <DefenseForm
                key={`${task.assignmentId}:${task.kind}`}
                task={task}
                busy={busyAction === `defense:${task.assignmentId}`}
                onSubmit={(text) => actions.submitDefense(task.assignmentId, text)}
              />
            ))}
            {view.receipts.map((receipt) => (
              <div
                key={receipt.assignmentId}
                className={receipt.officialCorrect ? "opacity-90" : "border-2 p-1"}
                style={receipt.officialCorrect ? undefined : { borderColor: "var(--qs-punch)" }}
              >
                {!receipt.officialCorrect ? (
                  <div
                    className="mb-3 border-y px-2 py-3"
                    style={{ borderColor: "var(--qs-punch)" }}
                  >
                    <ExamKicker>Oral defense required</ExamKicker>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--qs-ink)" }}>
                      {receipt.candidateName} explains the scratch reasoning.{" "}
                      {receipt.proxyName ?? "The committee"} separately explains the official
                      filing. A changed answer shows a decision, not a hidden-role verdict.
                    </p>
                  </div>
                ) : null}
                <ReceiptSheet receipt={receipt} compact />
              </div>
            ))}
          </div>
        ) : (
          <PassiveController
            kicker="Receipt audit"
            title="The red pen is warming up."
            text="Eyes on the shared stage. Scratch work and official answers are about to become public records."
          />
        );
      break;
    case "SECTION_RESULTS":
      content = (
        <section className="py-5">
          <ExamKicker>Section {view.sectionNumber} filed</ExamKicker>
          <ExamHeading>
            {view.score.rawCorrect >=
            Math.ceil(
              (view.score.passingScorePercent / 100) * Math.max(1, view.score.totalQuestions),
            )
              ? "Raw grade is passing. Deeply unsettling."
              : "Raw grade below the line. Form a study cult."}
          </ExamHeading>
          <div className="mt-8">
            <ExamScoreLine score={view.score} />
          </div>
          <ExamRule className="mt-7" />
          <p
            className="mt-5 max-w-2xl text-pretty text-sm leading-relaxed"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            This is the raw score only. Integrity adjustments stay sealed until the final hearing,
            because a live deduction would be an extremely efficient identity leak.
          </p>
        </section>
      );
      break;
    case "PROCTOR_REVIEW_VOTE":
      content = view.proctorReview ? (
        <PlayerBallot
          title="Suspend one Proxy"
          hint="A strict majority removes one player’s Proxy privileges for the next section. They still answer their own question and may discuss. Pick carefully: suspending an innocent person only humiliates the committee."
          players={view.proctorReview.eligibleTargets}
          selectedId={view.proctorReview.votedPlayerId}
          abstained={view.proctorReview.abstained}
          locked={view.proctorReview.locked}
          allowAbstain
          busy={busyAction === "suspension"}
          submitLabel="File suspension vote"
          onSubmit={actions.castSuspensionVote}
        />
      ) : null;
      break;
    case "PROCTOR_REVIEW_RESULT":
      content = view.proctorReview?.suspendedPlayerName ? (
        <section className="py-6">
          <ExamKicker>Midterm disciplinary bulletin</ExamKicker>
          <div className="mt-6">
            <ProctorTape name={view.proctorReview.suspendedPlayerName} />
          </div>
          <p
            className="mx-auto mt-7 max-w-2xl text-center text-sm leading-relaxed"
            style={{ color: "var(--qs-ink-dim)" }}
          >
            Next section, the suspended player remains a Candidate. Their Proxy assignment goes to a
            private committee vote, an arrangement famous for producing calm and efficient meetings.
          </p>
        </section>
      ) : (
        <PassiveController
          kicker="Midterm disciplinary bulletin"
          title="No majority. No suspension."
          text="The class split its vote. Everybody keeps Proxy privileges, including whichever person just exhaled too loudly."
        />
      );
      break;
    case "FINAL_ACCUSATION":
      content = view.hearing ? (
        <PlayerBallot
          title="Name the Saboteur"
          hint="A correct strict majority erases every sabotage deduction. A split or wrong vote leaves the transcript exactly as cursed as it is now."
          players={view.hearing.eligibleTargets}
          selectedId={view.hearing.accusedPlayerId}
          locked={view.hearing.accusedPlayerId !== null}
          busy={busyAction === "accusation"}
          submitLabel="Submit final accusation"
          onSubmit={(playerId) => {
            if (playerId !== null) actions.castFinalAccusation(playerId);
          }}
        />
      ) : null;
      break;
    case "FINAL_RESULTS":
      content = <ControllerFinal view={view} />;
      break;
    default:
      return unexpectedPhase(view.phase);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      {view.phase !== "LOBBY_SETUP" && view.phase !== "FINAL_RESULTS" ? (
        <ControllerChrome view={view} />
      ) : null}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${view.phase}:${view.sectionNumber}:${view.candidateAssignment?.id ?? "none"}:${view.proxyAssignment?.id ?? "none"}`}
          variants={phaseTransition}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
