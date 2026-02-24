import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host a Game",
};

export default function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
