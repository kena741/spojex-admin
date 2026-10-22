import { adminCacheKey } from "@/lib/admin-session-cache";
import { adminFetch } from "@/lib/hooks";

export type AdminSettingsPayload = {
  error?: string;
  appRows?: Array<{ id: string; data: unknown }>;
  languageRows?: Array<{ id?: string; code: string; name: string; active: boolean }>;
  taxRows?: Array<{
    id: number;
    country: string;
    name: string;
    value: number;
    type: string;
    is_fix?: boolean;
    active: boolean;
  }>;
  coinSettings?: { etb_per_coin?: number; coins_per_birr?: number };
};

/** Shared by Global settings and Payment settings (same API payload). */
export const ADMIN_SETTINGS_CACHE_KEY = adminCacheKey(["settings", "global"]);

export async function fetchAdminSettingsPayload(): Promise<AdminSettingsPayload> {
  const response = await adminFetch("/api/admin/settings");
  const payload = (await response.json()) as AdminSettingsPayload;
  if (!response.ok) throw new Error(payload.error || "Failed to load settings");
  return payload;
}
