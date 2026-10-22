"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ensureAdminCacheAuthBinding,
  fetchAdminCached,
  peekAdminCache,
  writeAdminCache,
} from "@/lib/admin-session-cache";

export type UseAdminQueryOptions<T> = {
  /** Stable cache key for this view (e.g. adminCacheKey(['people','list'])). Null disables. */
  key: string | null;
  fetcher: () => Promise<T>;
  /**
   * How long cached data is considered fresh without a network call.
   * Default Infinity = hold until explicit refresh (matches AdminReloadButton pages).
   */
  staleTime?: number;
  enabled?: boolean;
  /** When true, first mount always hits network even if cache exists (rare). */
  forceOnMount?: boolean;
};

export type UseAdminQueryResult<T> = {
  data: T | null;
  error: string | null;
  /** True only when there is no cached data to show yet. */
  loading: boolean;
  /** True during explicit refresh while previous data remains visible. */
  refreshing: boolean;
  refresh: () => Promise<T | null>;
  setData: (value: T | null | ((prev: T | null) => T | null)) => void;
  /** Write into cache without fetching (after local mutations). */
  replace: (value: T) => void;
};

/**
 * Session-scoped data for admin pages. Remounting a route reuses the last
 * successful payload immediately; network runs only on miss or refresh().
 */
export function useAdminQuery<T>(options: UseAdminQueryOptions<T>): UseAdminQueryResult<T> {
  const { key, fetcher, staleTime = Number.POSITIVE_INFINITY, enabled = true, forceOnMount = false } =
    options;

  ensureAdminCacheAuthBinding();

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const cached = key ? peekAdminCache<T>(key) : null;
  const [data, setDataState] = useState<T | null>(() => cached?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => enabled && !!key && !cached);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  const setData = useCallback((value: T | null | ((prev: T | null) => T | null)) => {
    setDataState((prev) => {
      const next = typeof value === "function" ? (value as (p: T | null) => T | null)(prev) : value;
      return next;
    });
  }, []);

  const replace = useCallback(
    (value: T) => {
      setDataState(value);
      if (key) writeAdminCache(key, value);
    },
    [key],
  );

  const refresh = useCallback(async () => {
    if (!key || !enabled) return null;
    const gen = ++generation.current;
    const hasData = peekAdminCache<T>(key) != null || data != null;
    if (hasData) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const next = await fetchAdminCached(key, () => fetcherRef.current(), {
        force: true,
        staleTime: 0,
      });
      if (gen !== generation.current) return next;
      setDataState(next);
      return next;
    } catch (err) {
      if (gen !== generation.current) return null;
      setError(err instanceof Error ? err.message : "Request failed");
      return null;
    } finally {
      if (gen === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [key, enabled, data]);

  useEffect(() => {
    if (!enabled || !key) {
      setLoading(false);
      return;
    }
    const hit = peekAdminCache<T>(key);
    if (hit && !forceOnMount) {
      setDataState(hit.data);
      setLoading(false);
      setError(null);
      const age = Date.now() - hit.updatedAt;
      if (age <= staleTime) return;
      // Soft revalidate in background when staleTime elapsed
      void (async () => {
        const gen = ++generation.current;
        setRefreshing(true);
        try {
          const next = await fetchAdminCached(key, () => fetcherRef.current(), {
            force: true,
            staleTime: 0,
          });
          if (gen !== generation.current) return;
          setDataState(next);
        } catch (err) {
          if (gen !== generation.current) return;
          setError(err instanceof Error ? err.message : "Request failed");
        } finally {
          if (gen === generation.current) setRefreshing(false);
        }
      })();
      return;
    }

    let cancelled = false;
    const gen = ++generation.current;
    setLoading(!hit);
    setRefreshing(Boolean(hit));
    void fetchAdminCached(key, () => fetcherRef.current(), {
      force: forceOnMount || !hit,
      staleTime,
    })
      .then((next) => {
        if (cancelled || gen !== generation.current) return;
        setDataState(next);
        setError(null);
      })
      .catch((err) => {
        if (cancelled || gen !== generation.current) return;
        setError(err instanceof Error ? err.message : "Request failed");
      })
      .finally(() => {
        if (cancelled || gen !== generation.current) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
    // Intentionally key/enabled/staleTime only — fetcher via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, staleTime, forceOnMount]);

  return { data, error, loading, refreshing, refresh, setData, replace };
}
