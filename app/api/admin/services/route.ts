import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { withServiceMediaUrls } from "@/lib/services-media";

const listingSelect =
  "*, users:provider_id(id, display_name, verified, avatar_url, role), category:category_id(id, label, emoji), subcategory:subcategory_id(id, label, emoji)";

export async function GET() {
  const auth = await requireAdminPermission("services:read");
  if (!auth.ok) return auth.error;
  const [services, categories, subcategories] = await Promise.all([
    auth.context.client
      .from("services")
      .select(listingSelect)
      .order("created_at", { ascending: false })
      .limit(500),
    auth.context.client.from("service_categories").select("*").order("sort_order"),
    auth.context.client.from("service_subcategories").select("*").order("sort_order"),
  ]);
  if (services.error) {
    const fallback = await auth.context.client
      .from("services")
      .select("*, users:provider_id(id, display_name, verified, avatar_url, role)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 400 });
    }
    return NextResponse.json({
      data: (fallback.data ?? []).map(withServiceMediaUrls),
      categories: categories.data ?? [],
      subcategories: subcategories.data ?? [],
    });
  }
  return NextResponse.json({
    data: (services.data ?? []).map(withServiceMediaUrls),
    categories: categories.data ?? [],
    subcategories: subcategories.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("services:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    action?: string;
    provider_id?: string;
    ids?: string[];
  };
  if (body.action !== "approve_selected" && body.action !== "approve_all") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  // Broad approve_all is disabled — require explicit selection.
  if (body.action === "approve_all") {
    return NextResponse.json(
      {
        error:
          "Approve-all is disabled. Select listings and approve them explicitly, or use action=approve_selected with ids.",
      },
      { status: 400 },
    );
  }
  const ids = (body.ids ?? []).filter(Boolean);
  if (!ids.length) {
    return NextResponse.json({ error: "ids are required" }, { status: 400 });
  }
  const { data, error } = await auth.context.client
    .from("services")
    .update({ published: true })
    .in("id", ids)
    .eq("published", false)
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    approved: ((data ?? []) as Array<{ id: string }>).map((r) => r.id),
  });
}
