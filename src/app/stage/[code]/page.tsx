import type { Metadata } from "next";
import { RoomScreen } from "@/room/shell";

export const metadata: Metadata = {
  title: "Stage",
};

export default async function StagePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomScreen code={code} layout="stage" />;
}
