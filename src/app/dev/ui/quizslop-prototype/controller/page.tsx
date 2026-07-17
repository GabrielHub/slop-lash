import { Suspense } from "react";
import type { Metadata } from "next";
import { MockQuizslopControllerShell } from "@/dev/game-fixtures/mock-quizslop-controller-shell";

export const metadata: Metadata = {
  title: "QuizSlop Prototype — Controller",
};

export default function QuizslopPrototypeControllerPage() {
  return (
    <Suspense>
      <MockQuizslopControllerShell />
    </Suspense>
  );
}
