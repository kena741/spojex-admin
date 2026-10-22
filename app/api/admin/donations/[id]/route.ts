import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { resolvePlatformBeneficiaryUserId } from "@/lib/platform-beneficiary";
import { requestAccessToken } from "@/lib/spojex/server";

const allowed = [
  "title",
  "slug",
  "summary",
  "description",
  "image_url",
  "cover_url",
  "goal_amount",
  "goal_coins",
  "beneficiary_user_id",
  "currency",
  "status",
  "is_featured",
  "sort_order",
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  // Prefer Python actions for lifecycle + asset lock + audit.
  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/donations/${id}/actions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update",
            reason: typeof body.reason === "string" ? body.reason : undefined,
            patch: body,
          }),
          cache: "no-store",
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        return NextResponse.json({
          data: (payload as { data?: unknown }).data ?? payload,
          source: "python",
        });
      }
      // Fall through on 404 (route not deployed yet).
      if (res.status !== 404) {
        const err = payload as { message?: string; error?: string };
        return NextResponse.json(
          { error: err.message || err.error || "Update failed", code: err.error },
          { status: res.status },
        );
      }
    } catch {
      // local fallback
    }
  }

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data: current } = await auth.context.client
    .from("donation_campaigns")
    .select("id, currency, beneficiary_user_id, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { count } = await auth.context.client
    .from("donation_contributions")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);
  const hasContribs = (count ?? 0) > 0;

  if ("currency" in patch && hasContribs) {
    const next = String(patch.currency || "").toUpperCase();
    const prev = String(current.currency || "").toUpperCase();
    if (next !== prev) {
      return NextResponse.json(
        {
          error:
            "Cannot change campaign asset after contributions exist. Historical coins must not be relabeled as ETB.",
          code: "asset_locked",
        },
        { status: 400 },
      );
    }
  }

  if ("beneficiary_user_id" in patch) {
    const raw = patch.beneficiary_user_id;
    const trimmed =
      typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    const nextId = trimmed
      ? trimmed
      : (await resolvePlatformBeneficiaryUserId(auth.context.client)) || null;
    if (String(nextId || "") !== String(current.beneficiary_user_id || "")) {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) {
        return NextResponse.json(
          { error: "Reason required when changing beneficiary.", code: "reason_required" },
          { status: 400 },
        );
      }
    }
    patch.beneficiary_user_id = nextId;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  if (typeof body.expected_updated_at === "string" && current.updated_at) {
    if (String(current.updated_at).slice(0, 19) !== String(body.expected_updated_at).slice(0, 19)) {
      return NextResponse.json(
        {
          error: "Campaign was modified by someone else. Reload and try again.",
          code: "conflict",
        },
        { status: 409 },
      );
    }
  }

  const { data, error: updateError } = await auth.context.client
    .from("donation_campaigns")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { count } = await auth.context.client
    .from("donation_contributions")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);
  if ((count ?? 0) > 0) {
    // Soft-close instead of destroying history.
    const { data, error } = await auth.context.client
      .from("donation_campaigns")
      .update({ status: "closed", is_featured: false })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      archived: true,
      data,
      message: "Campaign closed to preserve contribution history.",
    });
  }

  const { error: deleteError } = await auth.context.client.from("donation_campaigns").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, archived: false });
}
