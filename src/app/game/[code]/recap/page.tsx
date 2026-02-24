import { Metadata } from "next";
import { RecapShell } from "./recap-shell";

export const metadata: Metadata = {
  title: "Game Recap",
};

export default async function RecapPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return <RecapShell code={code} />;
}
