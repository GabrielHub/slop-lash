import { AmbientLab } from "./ambient-lab";

export const metadata = {
  title: "Ambient lab",
};

export default async function DevAmbientPage({
  searchParams,
}: {
  searchParams: Promise<Partial<Record<string, string | string[]>>>;
}) {
  const query = await searchParams;
  // Query presets for screenshots: scene, energy, surface, urgent=1, mood, theme, ui=0.
  const params = Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  return <AmbientLab params={params} />;
}
