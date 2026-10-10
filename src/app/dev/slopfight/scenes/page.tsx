import { SceneLabLoader } from "./scene-lab-loader";

export const metadata = {
  title: "SlopFight scene lab",
};

/** Dev route: the non-fight scenes with a synthetic timeline (?fixture=&scenario=forge&players=&arena=&t=&recap=1). */
export default function DevSlopfightScenesPage() {
  return <SceneLabLoader />;
}
