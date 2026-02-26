import { Suspense } from "react";
import type { Metadata } from "next";
import { GameShell } from "@/components/game-shell";

export const metadata: Metadata = {
  title: "Stage",
};

export default async function StagePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <Suspense>
      <GameShell code={code} viewMode="stage" />
    </Suspense>
  );
}
