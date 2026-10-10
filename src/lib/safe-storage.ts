/**
 * Best-effort `localStorage` for remembered conveniences: storage can be
 * blocked (private windows, cleared site data), so a read falls back to null
 * and a write quietly does nothing.
 */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Remembering is a convenience.
  }
}
