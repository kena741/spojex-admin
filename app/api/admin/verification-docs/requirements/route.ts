import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function PUT(request: Request) {
  const auth = await requireAdminPermission("profiles:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    role_slug?: string;
    requirements?: Array<{
      document_type_id?: string;
      is_required?: boolean;
      description?: string;
      sort_order?: number;
    }>;
  };

  const roleSlug = body.role_slug?.trim();
  if (!roleSlug) {
    return NextResponse.json({ error: "role_slug is required" }, { status: 400 });
  }

  const requirements = Array.isArray(body.requirements) ? body.requirements : [];
  const rows = requirements
    .map((item, index) => {
      const documentTypeId = item.document_type_id?.trim();
      if (!documentTypeId) return null;
      return {
        role_slug: roleSlug,
        document_type_id: documentTypeId,
        is_required: item.is_required ?? true,
        description: item.description?.trim() ?? "",
        sort_order: typeof item.sort_order === "number" ? item.sort_order : (index + 1) * 10,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);

  const { error: deleteError } = await auth.context.client
    .from("identity_role_document_requirements")
    .delete()
    .eq("role_slug", roleSlug);

  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { data, error } = await auth.context.client
    .from("identity_role_document_requirements")
    .insert(rows)
    .select("*, identity_document_types(*)");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}
