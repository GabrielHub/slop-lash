import { Suspense } from "react";
import type { Metadata } from "next";
import { resolveGameType } from "@/games/core";
import { GameShellResolver } from "@/components/shell-resolvers";

export const metadata: Metadata = {
  title: "Stage",
};

export default async function StagePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const gameType = await resolveGameType(code);

  return (
    <Suspense>
      <GameShellResolver
        code={code}
        gameType={gameType ?? "SLOPLASH"}
        viewMode="stage"
      />
    </Suspense>
  );
}
