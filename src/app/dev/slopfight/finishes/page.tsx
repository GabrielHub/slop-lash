import { FinishLabLoader } from "./finish-lab-loader";

export const metadata = {
  title: "SlopFight finish lab",
};

/**
 * Dev route: finished creatures lined up on a real arena
 * (?arena=garage|kitchen|rooftop&set=all|mix|four|<recipe>&sample=&page=&hits=1&grow=1&debug=1).
 */
export default function DevSlopfightFinishesPage() {
  return <FinishLabLoader />;
}
