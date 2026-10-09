import type { Metadata } from "next";
import { RoomScreen } from "@/room/shell";

export const metadata: Metadata = {
  title: "Controller",
};

export default async function ControllerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomScreen code={code} layout="controller" />;
}
