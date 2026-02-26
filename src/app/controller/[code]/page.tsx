import { Suspense } from "react";
import type { Metadata } from "next";
import { ControllerShell } from "@/components/controller-shell";

export const metadata: Metadata = {
  title: "Controller",
};

export default async function ControllerPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <Suspense>
      <ControllerShell code={code} />
    </Suspense>
  );
}
