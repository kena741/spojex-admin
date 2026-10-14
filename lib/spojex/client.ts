"use client";

import { getSpojexBrowserClient, type SpojexClient } from "@/lib/api/client";

/** Browser Spojex API client. */
export function getSpojexClient(): SpojexClient {
  return getSpojexBrowserClient();
}
