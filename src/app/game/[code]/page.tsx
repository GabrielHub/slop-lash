import type { Metadata } from "next";
import { RoomScreen } from "@/room/shell";

export const metadata: Metadata = {
  title: "Game",
};

export default async function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomScreen code={code} layout="game" />;
}
