import { Suspense } from "react";
import { Metadata } from "next";
import { resolveGameType } from "@/games/core";
import { GameShellResolver } from "@/components/shell-resolvers";

export const metadata: Metadata = {
  title: "Game",
};

export default async function GamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const gameType = await resolveGameType(code);

  return (
    <Suspense>
      <GameShellResolver code={code} gameType={gameType ?? "SLOPLASH"} />
    </Suspense>
  );
}
