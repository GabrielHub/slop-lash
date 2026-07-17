import { Suspense } from "react";
import type { Metadata } from "next";
import { MockQuizslopGameShell } from "@/dev/game-fixtures/mock-quizslop-game-shell";

export const metadata: Metadata = {
  title: "QuizSlop Prototype — Stage",
};

export default function QuizslopPrototypeStagePage() {
  return (
    <Suspense>
      <MockQuizslopGameShell />
    </Suspense>
  );
}
