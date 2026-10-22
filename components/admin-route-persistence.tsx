"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ensureAdminCacheAuthBinding,
  peekUiState,
  saveRouteScroll,
  takeRouteScroll,
  writeUiState,
} from "@/lib/admin-session-cache";

const SEARCH_KEY = (pathname: string) => `route-search:${pathname}`;

/**
 * Saves/restores window scroll and last querystring per admin pathname across
 * client navigations. Mount once inside the admin shell (not inside pages).
 */
export default function AdminRoutePersistence() {
  const pathname = usePathname();
  const router = useRouter();
  const restoredRef = useRef<string | null>(null);

  useEffect(() => {
    ensureAdminCacheAuthBinding();
  }, []);

  // Restore last search when landing on a bare path (sidebar return).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (restoredRef.current === pathname) return;
    const current = window.location.search || "";
    const saved = peekUiState<string>(SEARCH_KEY(pathname));
    if (saved && saved !== current && current === "") {
      restoredRef.current = pathname;
      router.replace(`${pathname}${saved}`, { scroll: false });
      return;
    }
    restoredRef.current = pathname;
  }, [pathname, router]);

  // Persist search while on the route (and on leave).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const persist = () => {
      writeUiState(SEARCH_KEY(pathname), window.location.search || "");
    };
    persist();
    window.addEventListener("popstate", persist);
    return () => {
      persist();
      window.removeEventListener("popstate", persist);
    };
  }, [pathname]);

  useEffect(() => {
    const saved = takeRouteScroll(pathname);
    if (saved != null) {
      const id = window.requestAnimationFrame(() => {
        window.scrollTo({ top: saved, left: 0, behavior: "instant" as ScrollBehavior });
      });
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [pathname]);

  useEffect(() => {
    return () => {
      saveRouteScroll(pathname, window.scrollY || window.pageYOffset || 0);
    };
  }, [pathname]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        saveRouteScroll(pathname, window.scrollY || window.pageYOffset || 0);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  return null;
}
