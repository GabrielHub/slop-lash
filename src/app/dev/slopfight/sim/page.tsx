import { FightDebugLoader } from "./fight-debug-loader";

export const metadata = {
  title: "SlopFight sim",
};

/** Dev route: watch a seeded fight as plain physics capsules (?a=&b=&arena=&seed=&speed=). */
export default function DevSlopfightSimPage() {
  return <FightDebugLoader />;
}
