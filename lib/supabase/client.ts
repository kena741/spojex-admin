"use client";

import { getSpojexBrowserClient, type SpojexClient } from "@/lib/api/client";

/** Browser Spojex API client (drop-in replacement for former Supabase browser client). */
export function getSupabase(): SpojexClient {
  return getSpojexBrowserClient();
}
