import { Suspense } from "react";
import type { Metadata } from "next";
import { ControllerShellResolver } from "@/components/shell-resolvers";

export const metadata: Metadata = {
  title: "Controller",
};

export default async function ControllerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <Suspense>
      <ControllerShellResolver code={code} />
    </Suspense>
  );
}
