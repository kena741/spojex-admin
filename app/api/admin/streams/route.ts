import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { slugifyStream } from "@/lib/streams";

export async function POST(request: Request) {
  const auth = await requireAdminPermission("streams:write");
  if (!auth.ok) return auth.error;
  const payload = (await request.json()) as {
    name?: string;
    slug?: string;
    tagline?: string;
    stream_url?: string;
    website_url?: string;
    image_url?: string;
    genre?: string;
    city?: string;
    status?: string;
    is_featured?: boolean;
    sort_order?: number;
    host_org_id?: string | null;
  };
  const name = payload.name?.trim();
  const streamUrl = payload.stream_url?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!streamUrl) {
    return NextResponse.json({ error: "stream_url is required" }, { status: 400 });
  }
  const slug = (payload.slug?.trim() || slugifyStream(name)).toLowerCase();

  let hostOrgId = typeof payload.host_org_id === "string" ? payload.host_org_id.trim() || null : null;
  if (!hostOrgId) {
    const { data: platformOrg } = await auth.context.client
      .from("organizations")
      .select("id")
      .eq("is_platform", true)
      .limit(1)
      .maybeSingle();
    hostOrgId = platformOrg?.id ?? null;
  }

  const baseRow = {
    name,
    slug,
    tagline: payload.tagline ?? "",
    stream_url: streamUrl,
    website_url: payload.website_url ?? "",
    image_url: payload.image_url ?? "",
    genre: payload.genre ?? "Live radio",
    city: payload.city ?? "Addis Ababa",
    status: payload.status ?? "inactive",
    is_featured: payload.is_featured ?? false,
    sort_order: payload.sort_order ?? 0,
  };

  let insert = await auth.context.client
    .from("radio_streams")
    .insert(hostOrgId ? { ...baseRow, host_org_id: hostOrgId } : baseRow)
    .select()
    .single();

  // Pre-migration DBs lack host_org_id — retry without it.
  if (
    insert.error &&
    hostOrgId &&
    /host_org_id|column .* does not exist/i.test(insert.error.message)
  ) {
    insert = await auth.context.client.from("radio_streams").insert(baseRow).select().single();
  }

  if (insert.error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${insert.error.message}. ${hint}` : insert.error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: insert.data });
}
