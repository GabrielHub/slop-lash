import { Suspense } from "react";
import type { Metadata } from "next";
import { GameShellResolver } from "@/components/shell-resolvers";

export const metadata: Metadata = {
  title: "Stage",
};

export default async function StagePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <Suspense>
      <GameShellResolver code={code} viewMode="stage" />
    </Suspense>
  );
}
