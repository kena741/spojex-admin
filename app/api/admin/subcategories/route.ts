import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { slugifyCategory } from "@/lib/service-categories";
import { requestAccessToken } from "@/lib/spojex/server";

export async function POST(request: Request) {
  const auth = await requireAdminPermission("catalog:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    category_id?: string;
    label?: string;
    emoji?: string;
    slug?: string;
    sort_order?: number;
    is_sport?: boolean;
  };
  const categoryId = body.category_id?.trim();
  const label = body.label?.trim();
  if (!categoryId) {
    return NextResponse.json({ error: "category_id is required" }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  const slug = (body.slug?.trim() || slugifyCategory(label)).toLowerCase();

  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Admin API unavailable" }, { status: 503 });
  }

  // Admin-only Cloud Run endpoint — do not use public /api/v1/data/service_subcategories.
  const res = await fetch(`${getSpojexApiBaseUrl()}/api/v1/admin/service-subcategories`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category_id: categoryId,
      slug,
      label,
      emoji: body.emoji ?? "",
      sort_order: body.sort_order ?? 0,
      is_sport: body.is_sport !== false,
    }),
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    return NextResponse.json(
      { error: payload.error || payload.message || "Could not create subcategory" },
      { status: res.status >= 400 ? res.status : 400 },
    );
  }
  return NextResponse.json({ data: payload.data ?? payload });
}
