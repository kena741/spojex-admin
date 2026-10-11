export const DEFAULT_SPOJEX_API_BASE_URL =
  "https://spojex-backend-prod-576757759417.europe-west3.run.app";

export function getSpojexApiBaseUrl() {
  const url =
    process.env.NEXT_PUBLIC_SPOJEX_API_BASE_URL ||
    process.env.SPOJEX_API_BASE_URL ||
    DEFAULT_SPOJEX_API_BASE_URL;
  return url.replace(/\/$/, "");
}

/** @deprecated Use getSpojexApiBaseUrl — kept for any leftover Supabase references */
export function getSupabaseUrl() {
  return getSpojexApiBaseUrl();
}

/** @deprecated API uses bearer tokens; no publishable key */
export function getSupabasePublishableKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  );
}

/** @deprecated Service role is unused once admin talks to Spojex API */
export function getSupabaseServiceRoleKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

export function hasServiceRole() {
  // Spojex API admin auth is JWT + admin table row; treat as always available.
  return true;
}
