"use client";

import { useCallback, useState } from "react";
import { peekUiState, writeUiState } from "@/lib/admin-session-cache";

/**
 * Persist lightweight UI state (tabs, local filters, panel open) across
 * App Router remounts for the current auth session. Not written to disk.
 */
export function useAdminUiState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValueState] = useState<T>(() => {
    const cached = peekUiState<T>(key);
    return cached != null ? cached : initial;
  });

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeUiState(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, setValue];
}
