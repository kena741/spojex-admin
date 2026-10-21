import { NextResponse } from "next/server";
import { DEFAULT_ADMIN_ROLES } from "@/lib/admin-permissions";
import { requireAdminPermission } from "@/lib/admin-auth";
import type { createAdminClient } from "@/lib/spojex/admin";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/** Upsert missing system roles (never skip when only super_admin exists). */
async function ensureDefaultRoles(client: ReturnType<typeof createAdminClient>) {
  const { data: existing } = await client.from("admin_role").select("slug");
  const have = new Set((existing ?? []).map((r: { slug: string }) => r.slug));
  const missing = DEFAULT_ADMIN_ROLES.filter((role) => !have.has(role.slug));
  if (missing.length) {
    await client.from("admin_role").insert(
      missing.map((role) => ({
        slug: role.slug,
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
        is_system: role.is_system,
      })),
    );
  }
  // Sync system role permissions for known slugs
  for (const role of DEFAULT_ADMIN_ROLES) {
    if (!have.has(role.slug) && !missing.find((m) => m.slug === role.slug)) continue;
    await client
      .from("admin_role")
      .update({
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
        is_system: true,
      })
      .eq("slug", role.slug)
      .eq("is_system", true);
  }
}

export async function GET() {
  const auth = await requireAdminPermission("roles:read");
  if (!auth.ok) return auth.error;

  // Prefer backend catalog (includes staff_count)
  const token = await requestAccessToken();
  if (token) {
    const base = getSpojexApiBaseUrl();
    const res = await fetch(`${base}/api/v1/admin/roles`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const payload = await res.json();
      return NextResponse.json(payload);
    }
  }

  await ensureDefaultRoles(auth.context.client);
  const { data, error } = await auth.context.client.from("admin_role").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("roles:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    slug?: string;
    name?: string;
    description?: string;
    permissions?: string[];
  };
  const slug = (body.slug ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const name = (body.name ?? "").trim();
  if (!slug || !name) {
    return NextResponse.json({ error: "slug and name are required" }, { status: 400 });
  }
  if (slug === "super_admin") {
    return NextResponse.json({ error: "Cannot recreate the Super Admin role" }, { status: 400 });
  }
  const { data, error } = await auth.context.client
    .from("admin_role")
    .insert({
      slug,
      name,
      description: (body.description ?? "").trim(),
      permissions: Array.isArray(body.permissions) ? body.permissions : [],
      is_system: false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminPermission("roles:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    id?: string;
    name?: string;
    description?: string;
    permissions?: string[];
  };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.description === "string") patch.description = body.description.trim();
  if (Array.isArray(body.permissions)) patch.permissions = body.permissions;
  const { data, error } = await auth.context.client
    .from("admin_role")
    .update(patch)
    .eq("id", body.id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminPermission("roles:write");
  if (!auth.ok) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { data: role } = await auth.context.client
    .from("admin_role")
    .select("is_system")
    .eq("id", id)
    .maybeSingle();
  if (role?.is_system) {
    return NextResponse.json({ error: "System roles cannot be deleted" }, { status: 400 });
  }
  const { error } = await auth.context.client.from("admin_role").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
