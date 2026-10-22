/**
 * In-memory session cache for admin client pages.
 * - Survives Next.js App Router remounts while the shell stays mounted
 * - Cleared on logout / user switch (never written to localStorage)
 * - Dedupes concurrent fetches for the same key
 */

import { onAuthStateChange } from "@/lib/api/session";
import { clearIdentityCatalogCache } from "@/lib/identity-catalog";

export type AdminCacheEntry<T = unknown> = {
  data: T;
  updatedAt: number;
  userId: string | null;
};

type Inflight = {
  promise: Promise<unknown>;
  userId: string | null;
};

const store = new Map<string, AdminCacheEntry>();
const inflight = new Map<string, Inflight>();
const listeners = new Set<() => void>();

let boundUserId: string | null = null;
let authBound = false;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeAdminCache(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAdminCacheUserId() {
  return boundUserId;
}

export function setAdminCacheUserId(userId: string | null) {
  if (boundUserId && userId && boundUserId !== userId) {
    clearAdminSessionCache();
  }
  if (!userId && boundUserId) {
    clearAdminSessionCache();
  }
  boundUserId = userId;
}

export function clearAdminSessionCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    inflight.clear();
    notify();
    return;
  }
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`) || key.startsWith(`${prefix}/`)) {
      store.delete(key);
    }
  }
  for (const key of inflight.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`) || key.startsWith(`${prefix}/`)) {
      inflight.delete(key);
    }
  }
  notify();
}

export function peekAdminCache<T>(key: string): AdminCacheEntry<T> | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (boundUserId && entry.userId && entry.userId !== boundUserId) {
    store.delete(key);
    return null;
  }
  return entry as AdminCacheEntry<T>;
}

export function writeAdminCache<T>(key: string, data: T) {
  store.set(key, {
    data,
    updatedAt: Date.now(),
    userId: boundUserId,
  });
  notify();
}

export function invalidateAdminCache(prefixOrKey: string) {
  clearAdminSessionCache(prefixOrKey);
}

/** Run fetcher once per key; concurrent callers share the promise. */
export async function fetchAdminCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { force?: boolean; staleTime?: number },
): Promise<T> {
  const force = opts?.force === true;
  const staleTime = opts?.staleTime ?? Number.POSITIVE_INFINITY;
  const existing = peekAdminCache<T>(key);
  if (!force && existing) {
    const age = Date.now() - existing.updatedAt;
    if (age <= staleTime) return existing.data;
  }

  const pending = inflight.get(key);
  if (pending && pending.userId === boundUserId && !force) {
    return pending.promise as Promise<T>;
  }

  const promise = (async () => {
    const data = await fetcher();
    writeAdminCache(key, data);
    return data;
  })().finally(() => {
    const current = inflight.get(key);
    if (current?.promise === promise) inflight.delete(key);
  });

  inflight.set(key, { promise, userId: boundUserId });
  return promise;
}

/** Scroll positions per route (session memory only). */
const scrollByPath = new Map<string, number>();

export function saveRouteScroll(pathname: string, y: number) {
  scrollByPath.set(pathname, y);
}

export function takeRouteScroll(pathname: string): number | null {
  return scrollByPath.has(pathname) ? (scrollByPath.get(pathname) ?? 0) : null;
}

/** UI snapshots (tabs, draft filters not yet reloaded, etc.). */
const uiByKey = new Map<string, unknown>();

export function peekUiState<T>(key: string): T | null {
  return (uiByKey.get(key) as T | undefined) ?? null;
}

export function writeUiState<T>(key: string, value: T) {
  uiByKey.set(key, value);
}

export function clearUiState(prefix?: string) {
  if (!prefix) {
    uiByKey.clear();
    scrollByPath.clear();
    return;
  }
  for (const key of uiByKey.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) uiByKey.delete(key);
  }
}

/** Bind once from the client: clear cache when auth user changes or signs out. */
export function ensureAdminCacheAuthBinding() {
  if (authBound || typeof window === "undefined") return;
  authBound = true;
  onAuthStateChange((event, session) => {
    const nextId = session?.user?.id ?? null;
    if (event === "SIGNED_OUT" || !nextId) {
      boundUserId = null;
      clearAdminSessionCache();
      clearUiState();
      clearIdentityCatalogCache();
      return;
    }
    if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
      if (boundUserId && boundUserId !== nextId) {
        clearAdminSessionCache();
        clearUiState();
        clearIdentityCatalogCache();
      }
      boundUserId = nextId;
      // TOKEN_REFRESHED must not clear cache — same user.
    }
  });
}

export function adminCacheKey(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => (part == null || part === "" ? "_" : String(part)))
    .join(":");
}
