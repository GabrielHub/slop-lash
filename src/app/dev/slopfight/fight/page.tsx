import { FightLabLoader } from "./fight-lab-loader";

export const metadata = {
  title: "SlopFight fight lab",
};

/** Dev route: the real face-off, fight and result scenes on a seeded fight (?a=&b=&arena=&seed=&phase=&t=). */
export default function DevSlopfightFightPage() {
  return <FightLabLoader />;
}
