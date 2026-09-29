import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("catalog:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    label?: string;
    emoji?: string;
    sort_order?: number;
    is_sport?: boolean;
  };

  const patch: Record<string, unknown> = {};
  if ("label" in body) patch.label = body.label?.trim();
  if ("emoji" in body) patch.emoji = body.emoji ?? "";
  if ("sort_order" in body) patch.sort_order = body.sort_order;
  if ("is_sport" in body) patch.is_sport = body.is_sport !== false;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error: updateError } = await auth.context.client
    .from("service_subcategories")
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
  const auth = await requireAdminPermission("catalog:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const { error: deleteError } = await auth.context.client
    .from("service_subcategories")
    .delete()
    .eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
