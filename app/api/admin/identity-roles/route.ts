import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyIdentity } from "@/lib/identity-catalog-seeds";
import { inferIdentityRoleKind } from "@/lib/identity-catalog";

export async function GET() {
  const auth = await requireAdminPermission("profiles:read");
  if (!auth.ok) return auth.error;

  const [{ data: groups, error: groupError }, { data: roles, error: roleError }] = await Promise.all([
    auth.context.client.from("identity_role_groups").select("*").order("sort_order"),
    auth.context.client
      .from("identity_roles")
      .select("*, identity_role_groups(slug, label)")
      .order("sort_order"),
  ]);

  if (groupError || roleError) {
    const message = groupError?.message ?? roleError?.message ?? "Failed to load identity catalog";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ data: { groups: groups ?? [], roles: roles ?? [] } });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("profiles:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    group_id?: string;
    label?: string;
    slug?: string;
    blurb?: string;
    sort_order?: number;
    kind?: string;
    profile_title?: string;
    description?: string;
    license_label?: string;
    default_service_category_slug?: string;
    icon?: string;
  };

  const groupId = body.group_id?.trim();
  const label = body.label?.trim();
  if (!groupId || !label) {
    return NextResponse.json({ error: "group_id and label are required" }, { status: 400 });
  }

  const { data: group } = await auth.context.client
    .from("identity_role_groups")
    .select("slug")
    .eq("id", groupId)
    .maybeSingle();

  // Prefer a full slugify from the label when the typed slug is empty or too short
  // (admins often leave "t" after typing "Trainer").
  const typedSlug = body.slug?.trim().toLowerCase() ?? "";
  const fromLabel = slugifyIdentity(label);
  const slug =
    typedSlug.length >= 2 && /^[a-z][a-z0-9_]*$/.test(typedSlug)
      ? typedSlug
      : fromLabel || typedSlug;
  if (!slug || slug.length < 2) {
    return NextResponse.json(
      { error: "slug must be at least 2 characters (e.g. trainer)" },
      { status: 400 },
    );
  }

  const kind =
    body.kind?.trim() ||
    inferIdentityRoleKind(group?.slug ?? "", slug);

  const { data, error: insertError } = await auth.context.client
    .from("identity_roles")
    .insert({
      group_id: groupId,
      slug,
      label,
      blurb: body.blurb ?? "",
      sort_order: body.sort_order ?? 0,
      is_system: false,
      is_active: true,
      kind,
      profile_title: (body.profile_title ?? label).trim(),
      description: (body.description ?? body.blurb ?? "").trim(),
      license_label: (body.license_label ?? "").trim(),
      default_service_category_slug: (body.default_service_category_slug ?? "").trim(),
      icon: (body.icon ?? "").trim(),
    })
    .select("*, identity_role_groups(slug, label)")
    .single();

  if (insertError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${insertError.message}. ${hint}` : insertError.message },
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
    group_id?: string;
    label?: string;
    blurb?: string;
    is_active?: boolean;
    sort_order?: number;
    kind?: string;
    profile_title?: string;
    description?: string;
    license_label?: string;
    default_service_category_slug?: string;
    icon?: string;
  };

  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("group_id" in body) patch.group_id = body.group_id;
  if ("label" in body) patch.label = body.label;
  if ("blurb" in body) patch.blurb = body.blurb;
  if ("is_active" in body) patch.is_active = body.is_active;
  if ("sort_order" in body) patch.sort_order = body.sort_order;
  if ("kind" in body && body.kind) patch.kind = body.kind;
  if ("profile_title" in body) patch.profile_title = body.profile_title;
  if ("description" in body) patch.description = body.description;
  if ("license_label" in body) patch.license_label = body.license_label;
  if ("default_service_category_slug" in body) {
    patch.default_service_category_slug = body.default_service_category_slug;
  }
  if ("icon" in body) patch.icon = body.icon;

  const { data, error: updateError } = await auth.context.client
    .from("identity_roles")
    .update(patch)
    .eq("id", body.id)
    .select("*, identity_role_groups(slug, label)")
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

export async function DELETE(request: Request) {
  const auth = await requireAdminPermission("profiles:write");
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: role } = await auth.context.client
    .from("identity_roles")
    .select("is_system, slug, kind")
    .eq("id", id)
    .maybeSingle();

  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  // Compatibility: users.role still stores account-role / legacy slugs.
  const { count: usersOnSlug } = await auth.context.client
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", role.slug);

  // Prefer assignment table when present (multi-role foundation).
  let assignmentCount = 0;
  const { count: assigned, error: assignErr } = await auth.context.client
    .from("user_role_assignments")
    .select("*", { count: "exact", head: true })
    .eq("identity_role_id", id)
    .eq("status", "active");
  if (!assignErr) assignmentCount = assigned ?? 0;

  if ((usersOnSlug ?? 0) > 0 || assignmentCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete a role that is assigned to users. Hide it instead." },
      { status: 400 },
    );
  }

  const { error: deleteError } = await auth.context.client.from("identity_roles").delete().eq("id", id);
  if (deleteError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${deleteError.message}. ${hint}` : deleteError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
