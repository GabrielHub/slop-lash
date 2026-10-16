import { StageProbe } from "./stage-probe";

export const metadata = {
  title: "SlopFight creature lab",
};

/**
 * Dev creature lab: ?mode=gallery|forge|walk|single|finishes&sample=<id>&page=<n>
 * (&hold=<parts> pauses forge playback, &probe=1 adds /dev/slopfight-probe.json,
 * &finish=<recipe> finishes every sheet, mode=finishes&set=all|mix|four lines
 * the finishes up; /dev/slopfight/finishes shows them under arena lighting).
 */
export default function DevSlopfightPage() {
  return <StageProbe />;
}
