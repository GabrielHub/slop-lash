import { StageLabLoader } from "./stage-lab-loader";

export const metadata = {
  title: "SlopFight stage lab",
};

/** Dev route: arenas, shots, transitions, quality and post (?arena=&shot=&transition=&quality=&phase=&at=&ui=0). */
export default function DevSlopfightStagePage() {
  return <StageLabLoader />;
}
