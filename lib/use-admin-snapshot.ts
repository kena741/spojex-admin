"use client";

import { useLayoutEffect } from "react";

/**
 * Detail pages keep many local useState slices that mutations also edit.
 * Fetch a whole-page snapshot through useAdminQuery, then fan it out into
 * those slices before paint (so a cache hit never flashes empty state).
 */
export function useApplyAdminSnapshot<T>(data: T | null, apply: (snapshot: T) => void) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (data != null) apply(data);
  }, [data]);
}
