/**
 * Phone haptics, where the device supports them (Android; iOS Safari ignores
 * it). A number is one pulse in ms; an array alternates pulse and pause, e.g.
 * `[20, 60, 30]`. Used for controller moments only: vote locked (10), your
 * answer won ([20, 60, 30]), you got slopped (60), your call landed ([15, 40, 15]).
 */
export function buzz(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when vibration is blocked (no user gesture yet).
  }
}
