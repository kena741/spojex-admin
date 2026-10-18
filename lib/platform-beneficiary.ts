import type { SpojexClient } from "@/lib/api/client";

/** Resolve the Spojex platform org owner user id (default campaign beneficiary). */
export async function resolvePlatformBeneficiaryUserId(
  client: SpojexClient,
): Promise<string | null> {
  const { data, error } = await client
    .from("organizations")
    .select("user_id")
    .eq("is_platform", true)
    .maybeSingle();
  if (error) return null;
  const row = data as { user_id?: string | null } | null;
  const id = row?.user_id ? String(row.user_id).trim() : "";
  return id || null;
}
