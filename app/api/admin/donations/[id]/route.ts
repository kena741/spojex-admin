import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { resolvePlatformBeneficiaryUserId } from "@/lib/platform-beneficiary";

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
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  // Empty / null beneficiary → Spojex platform org owner (default).
  if ("beneficiary_user_id" in patch) {
    const raw = patch.beneficiary_user_id;
    const trimmed =
      typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    if (!trimmed) {
      const platformUser = await resolvePlatformBeneficiaryUserId(auth.context.client);
      patch.beneficiary_user_id = platformUser;
    } else {
      patch.beneficiary_user_id = trimmed;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
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

  const { error: deleteError } = await auth.context.client.from("donation_campaigns").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
