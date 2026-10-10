import { useState } from "react";
import { useClientValue } from "@/hooks/use-hydrated";
import { readStored, writeStored } from "@/lib/safe-storage";

/**
 * The name this browser last joined or hosted with, so the next game only
 * needs a code. Storage can be blocked (private windows), so every access is
 * best-effort.
 */
const LAST_NAME_KEY = "slop-lash:last-name";

/** The remembered name, or "" when there is none or storage is blocked. */
function readLastName(): string {
  return readStored(LAST_NAME_KEY) ?? "";
}

/** Remembers `name` for the next join or host form. */
export function saveLastName(name: string): void {
  writeStored(LAST_NAME_KEY, name);
}

/** A name field's value: the remembered name until the player types. */
export function useRememberedName(): [string, (name: string) => void] {
  // The name only changes through these forms, which hold edits in state.
  const storedName = useClientValue(readLastName, "");
  const [typedName, setTypedName] = useState<string | null>(null);
  return [typedName ?? storedName, setTypedName];
}
