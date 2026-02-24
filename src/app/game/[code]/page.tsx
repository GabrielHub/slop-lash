import { GameShell } from "@/components/game-shell";

export default async function GamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return <GameShell code={code} />;
}
