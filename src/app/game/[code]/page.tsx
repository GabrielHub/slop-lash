import { Suspense } from "react";
import { Metadata } from "next";
import { GameShellResolver } from "@/components/shell-resolvers";

export const metadata: Metadata = {
  title: "Game",
};

export default async function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <Suspense>
      <GameShellResolver code={code} />
    </Suspense>
  );
}
