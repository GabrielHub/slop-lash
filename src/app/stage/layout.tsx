import { ForceDarkTheme } from "./force-dark-theme";

export default function StageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ForceDarkTheme />
      {children}
    </>
  );
}
