import { Suspense } from "react";
import { Metadata } from "next";
import { GameShell } from "@/components/game-shell";

export const metadata: Metadata = {
  title: "Game",
};

export default async function GamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <Suspense>
      <GameShell code={code} />
    </Suspense>
  );
}
