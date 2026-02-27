import { Suspense } from "react";
import type { Metadata } from "next";
import { resolveGameType } from "@/games/core";
import { ControllerShellResolver } from "@/components/shell-resolvers";

export const metadata: Metadata = {
  title: "Controller",
};

export default async function ControllerPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const gameType = await resolveGameType(code);

  return (
    <Suspense>
      <ControllerShellResolver code={code} gameType={gameType ?? "SLOPLASH"} />
    </Suspense>
  );
}
