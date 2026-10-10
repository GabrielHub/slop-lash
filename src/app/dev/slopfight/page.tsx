import { StageProbe } from "./stage-probe";

export const metadata = {
  title: "SlopFight creature lab",
};

/**
 * Dev creature lab: ?mode=gallery|forge|walk|single&sample=<id>&page=<n>
 * (&hold=<parts> pauses forge playback, &probe=1 adds /dev/slopfight-probe.json).
 */
export default function DevSlopfightPage() {
  return <StageProbe />;
}
