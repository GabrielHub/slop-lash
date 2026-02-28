import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Returns `[copied, copy]` — call `copy(text)` to write to clipboard
 * and flash `copied` to `true` for 2 seconds.
 */
export function useCopyToClipboard(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  return [copied, copy];
}
