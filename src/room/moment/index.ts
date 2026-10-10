// The moment kit: one clock for staged beats, and the pieces that land on them.

export { useMoment, type MomentCue, type MomentOptions, type MomentOrigin } from "./use-moment";
export { useHeld } from "./use-held";
export { useReducedAfterMount } from "./use-reduced";
export { FRESH_MS, isFreshPhase, useFreshAtMount } from "./use-fresh";
export { Stamp, type StampSize, type StampTone } from "./stamp";
export { CountUp } from "./count-up";
export { TypeOn } from "./type-on";
export { fireConfetti, type ConfettiOrigin, type ConfettiPreset } from "./confetti";
export { buzz } from "./buzz";
export { SurfaceProvider, useSurface, type Surface } from "./surface";
export {
  StageFxProvider,
  useStageFx,
  type FlashTone,
  type ShakeKind,
  type StageFx,
} from "./stage-fx";
