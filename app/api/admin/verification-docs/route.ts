import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  fallbackRequirementsForRole,
  VERIFICATION_DOCUMENT_TYPE_SEEDS,
  type IdentityDocumentType,
  type IdentityRoleDocumentRequirement,
} from "@/lib/verification-docs";

function isMissingTable(message: string) {
  return (
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("does not exist")
  );
}

export async function GET(request: Request) {
  const auth = await requireAdminPermission("profiles:read");
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const roleSlug = url.searchParams.get("role")?.trim() || "";

  const [{ data: types, error: typeError }, requirementsResult] = await Promise.all([
    auth.context.client.from("identity_document_types").select("*").order("sort_order"),
    roleSlug
      ? auth.context.client.rpc("identity_verification_requirements", { p_role_slug: roleSlug })
      : auth.context.client
          .from("identity_role_document_requirements")
          .select("*, identity_document_types(*)")
          .order("sort_order"),
  ]);

  if (typeError && isMissingTable(typeError.message)) {
    return NextResponse.json({
      data: {
        types: VERIFICATION_DOCUMENT_TYPE_SEEDS.map((item) => ({ ...item, id: item.slug })),
        requirements: roleSlug
          ? fallbackRequirementsForRole(roleSlug)
          : [],
        fromDatabase: false,
      },
    });
  }

  if (typeError) {
    return NextResponse.json({ error: typeError.message }, { status: 400 });
  }

  if (requirementsResult.error) {
    if (isMissingTable(requirementsResult.error.message)) {
      return NextResponse.json({
        data: {
          types: (types ?? []) as IdentityDocumentType[],
          requirements: roleSlug ? fallbackRequirementsForRole(roleSlug) : [],
          fromDatabase: false,
        },
      });
    }
    return NextResponse.json({ error: requirementsResult.error.message }, { status: 400 });
  }

  return NextResponse.json({
    data: {
      types: (types ?? []) as IdentityDocumentType[],
      requirements: (requirementsResult.data ?? []) as
        | IdentityRoleDocumentRequirement[]
        | ReturnType<typeof fallbackRequirementsForRole>,
      fromDatabase: true,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("profiles:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    slug?: string;
    label?: string;
    description?: string;
    step?: string;
    is_active?: boolean;
    sort_order?: number;
  };

  const slug = body.slug?.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const label = body.label?.trim();
  if (!slug || !label) {
    return NextResponse.json({ error: "slug and label are required" }, { status: 400 });
  }

  const step = body.step === "identity" ? "identity" : "role_evidence";
  const { data, error } = await auth.context.client
    .from("identity_document_types")
    .insert({
      slug,
      label,
      description: body.description?.trim() ?? "",
      step,
      is_active: body.is_active ?? true,
      sort_order: body.sort_order ?? 100,
    })
    .select("*")
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminPermission("profiles:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    id?: string;
    label?: string;
    description?: string;
    step?: string;
    is_active?: boolean;
    sort_order?: number;
  };

  if (!body.id?.trim()) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.label === "string") patch.label = body.label.trim();
  if (typeof body.description === "string") patch.description = body.description.trim();
  if (body.step === "identity" || body.step === "role_evidence") patch.step = body.step;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;

  const { data, error } = await auth.context.client
    .from("identity_document_types")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
