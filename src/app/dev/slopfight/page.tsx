import { StageProbe } from "./stage-probe";

export const metadata = {
  title: "SlopFight stage",
};

/** Dev stage route; the Creature workstream replaces the probe with the creature gallery. */
export default function DevSlopfightPage() {
  return <StageProbe />;
}
