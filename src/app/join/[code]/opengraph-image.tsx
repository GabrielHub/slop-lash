import { notFound } from "next/navigation";
import { isRoomInviteCode } from "@/lib/room-invite";
import { renderRoomInviteImage } from "./_room-invite-image";

export const runtime = "edge";
export const alt = "Invitation to join a SlopBox Party Pack room";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function RoomInviteOpenGraphImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isRoomInviteCode(code)) notFound();
  return renderRoomInviteImage(code);
}
