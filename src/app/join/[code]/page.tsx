import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JoinRoomForm } from "../join-room-form";
import { getRoomInviteDetails, isRoomInviteCode } from "@/lib/room-invite";

interface JoinRoomPageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: JoinRoomPageProps): Promise<Metadata> {
  const { code } = await params;
  if (!isRoomInviteCode(code)) {
    return {
      title: "Join a Game",
      robots: { index: false, follow: false },
    };
  }

  const invite = getRoomInviteDetails(code);
  const imageUrl = `${invite.path}/opengraph-image`;

  return {
    title: invite.title,
    description: invite.description,
    alternates: { canonical: invite.path },
    robots: { index: false, follow: false },
    openGraph: {
      title: invite.title,
      description: invite.description,
      siteName: "SlopBox Party Pack",
      type: "website",
      url: invite.path,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `Invitation to SlopBox room ${invite.roomCode}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: invite.title,
      description: invite.description,
      images: [imageUrl],
    },
  };
}

export default async function JoinRoomPage({ params }: JoinRoomPageProps) {
  const { code } = await params;
  if (!isRoomInviteCode(code)) notFound();

  const invite = getRoomInviteDetails(code);
  return <JoinRoomForm initialRoomCode={invite.roomCode} />;
}
