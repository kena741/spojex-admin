import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    label?: string;
    emoji?: string;
    sort_order?: number;
    slug?: string;
  };

  const patch: Record<string, unknown> = {};
  if ("label" in body) patch.label = body.label?.trim();
  if ("emoji" in body) patch.emoji = body.emoji ?? "";
  if ("sort_order" in body) patch.sort_order = body.sort_order;
  if ("slug" in body && body.slug?.trim()) {
    patch.slug = body.slug.trim().toLowerCase();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error: updateError } = await auth.context.client
    .from("gym_categories")
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data: category } = await auth.context.client
    .from("gym_categories")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  if (category?.slug) {
    const { count, error: countError } = await auth.context.client
      .from("gyms")
      .select("*", { count: "exact", head: true })
      .eq("category", category.slug);

    if (countError) {
      const message = countError.message;
      if (
        !message.includes("schema cache") &&
        !message.includes("Could not find the table")
      ) {
        const hint = missingServiceRoleMessage();
        return NextResponse.json(
          { error: hint ? `${message}. ${hint}` : message },
          { status: 400 },
        );
      }
    } else if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Cannot delete a category used by gyms." },
        { status: 400 },
      );
    }
  }

  const { error: deleteError } = await auth.context.client
    .from("gym_categories")
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
