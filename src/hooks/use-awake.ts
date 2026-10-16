import { useEffect, useState } from "react";

/** True while the pointer, keyboard or wheel has been used in the last `ms`. */
export function useAwake(ms: number) {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let timer = window.setTimeout(() => setAwake(false), ms);
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAwake(false), ms);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, wake));
    };
  }, [ms]);
  return awake;
}
