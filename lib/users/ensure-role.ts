import { adminFetch } from "@/lib/hooks";

/** Idempotent retry after create when `assignment_pending` is true. */
export async function ensureUserRoleAssignment(
  userId: string,
  role?: string,
): Promise<{ ok: boolean; assignment_pending: boolean; error?: string }> {
  const res = await adminFetch(`/api/admin/users/${userId}/ensure-role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(role ? { role } : {}),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    assignment_pending?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      assignment_pending: true,
      error: payload.error || "Failed to sync role assignment",
    };
  }
  return {
    ok: true,
    assignment_pending: Boolean(payload.assignment_pending),
  };
}
