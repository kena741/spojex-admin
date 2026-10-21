import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { withServiceMediaUrls } from "@/lib/services-media";
import { requestAccessToken } from "@/lib/spojex/server";

const listingSelect =
  "*, users:provider_id(id, display_name, verified, avatar_url, role), category:category_id(id, label, emoji), subcategory:subcategory_id(id, label, emoji)";

async function proxyPython(path: string, init?: RequestInit) {
  const token = await requestAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getSpojexApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({}));
    return { res, payload };
  } catch {
    return null;
  }
}

function enrichLocalRow(row: Record<string, unknown>) {
  const published = Boolean(row.published);
  const users = row.users as
    | { id?: string; display_name?: string; verified?: boolean; avatar_url?: string; role?: string }
    | null
    | undefined;
  return withServiceMediaUrls({
    ...row,
    href: `/admin/services/${row.id}`,
    publication_label: published ? "Published" : "Pending review",
    publication_state: published ? "published" : "pending_review",
    delivery_label: undefined,
    provider_verification_label: users?.verified
      ? "Identity verified"
      : "Identity not verified",
    provider_verification_note:
      "Profile identity verification only — not a professional credential or license.",
  });
}

export async function GET(request: Request) {
  const auth = await requireAdminPermission("services:read");
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const proxied = await proxyPython(`/api/v1/admin/services?${url.searchParams}`);
  if (proxied?.res.ok) {
    const payload = proxied.payload as {
      data?: Array<Record<string, unknown>>;
      categories?: unknown[];
      subcategories?: unknown[];
    };
    const [categories, subcategories] = await Promise.all([
      auth.context.client.from("service_categories").select("*").order("sort_order"),
      auth.context.client.from("service_subcategories").select("*").order("sort_order"),
    ]);
    return NextResponse.json({
      ...payload,
      data: (payload.data ?? []).map((row) => withServiceMediaUrls(row)),
      categories: categories.data ?? payload.categories ?? [],
      subcategories: subcategories.data ?? payload.subcategories ?? [],
      source: "python",
    });
  }

  // Local fallback with client-side filter/pagination (bounded)
  const [services, categories, subcategories] = await Promise.all([
    auth.context.client
      .from("services")
      .select(listingSelect)
      .order("created_at", { ascending: false })
      .limit(500),
    auth.context.client.from("service_categories").select("*").order("sort_order"),
    auth.context.client.from("service_subcategories").select("*").order("sort_order"),
  ]);

  let rows: Record<string, unknown>[] = [];
  if (services.error) {
    const withCategory = await auth.context.client
      .from("services")
      .select(
        "*, users:provider_id(id, display_name, verified, avatar_url, role), category:category_id(id, label, emoji)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (!withCategory.error) {
      rows = (withCategory.data ?? []) as Record<string, unknown>[];
    } else {
      const fallback = await auth.context.client
        .from("services")
        .select("*, users:provider_id(id, display_name, verified, avatar_url, role)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (fallback.error) {
        const msg = services.error.message.includes("subcategory_id")
          ? `${services.error.message} Migration a1spojex000062 (service_subcategories) may still be deploying.`
          : fallback.error.message;
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      rows = (fallback.data ?? []) as Record<string, unknown>[];
    }
  } else {
    rows = (services.data ?? []) as Record<string, unknown>[];
  }

  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const category = url.searchParams.get("category") || "all";
  const subcategory = url.searchParams.get("subcategory") || "all";
  const published = url.searchParams.get("published") || "all";
  const delivery = url.searchParams.get("delivery") || "all";
  const pricingType = url.searchParams.get("pricing_type") || "all";
  const provider = (url.searchParams.get("provider") || "").trim().toLowerCase();
  const location = (url.searchParams.get("location") || "").trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") || 40) || 40));

  const global = {
    services: rows.length,
    published: rows.filter((r) => r.published).length,
    pending: rows.filter((r) => !r.published).length,
    featured: rows.filter((r) => r.is_featured).length,
    label: "All services (not filter-scoped)",
  };

  let filtered = rows.filter((row) => {
    if (category !== "all" && row.category_id !== category) return false;
    if (subcategory !== "all" && row.subcategory_id !== subcategory) return false;
    if (published === "yes" || published === "published" || published === "approved") {
      if (!row.published) return false;
    }
    if (published === "pending" || published === "no") {
      if (row.published) return false;
    }
    if (delivery !== "all" && String(row.availability_mode || "").toLowerCase() !== delivery) {
      return false;
    }
    if (pricingType !== "all" && String(row.pricing_type || "").toLowerCase() !== pricingType) {
      return false;
    }
    if (provider) {
      const users = row.users as { display_name?: string } | null;
      const hay = `${users?.display_name || ""} ${row.provider_id || ""}`.toLowerCase();
      if (!hay.includes(provider)) return false;
    }
    if (location) {
      const hay = `${row.city || ""} ${row.country || ""} ${row.service_area || ""}`.toLowerCase();
      if (!hay.includes(location)) return false;
    }
    if (q) {
      const users = row.users as { display_name?: string } | null;
      const cat = row.category as { label?: string } | null;
      const sub = row.subcategory as { label?: string } | null;
      const hay = [
        row.title,
        row.description,
        row.city,
        row.country,
        users?.display_name,
        cat?.label,
        sub?.label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const total = filtered.length;
  const filteredPending = filtered.filter((r) => !r.published).length;
  const start = (page - 1) * pageSize;
  filtered = filtered.slice(start, start + pageSize);

  return NextResponse.json({
    data: filtered.map((row) => enrichLocalRow(row)),
    total,
    page,
    page_size: pageSize,
    categories: categories.data ?? [],
    subcategories: subcategories.data ?? [],
    source: "admin_local_fallback",
    summary_scope: {
      global,
      filtered: {
        services: total,
        pending: filteredPending,
        label: "Matching current filters",
      },
    },
    definitions: {
      publication:
        "Approval and publication share one flag (`published`). Approving publishes immediately.",
      delivery_on_request:
        "Legacy availability_mode value preserved as-is. Displayed as “On request”; not remapped.",
      provider_verification:
        "users.verified is identity verification scope only — not professional credentials.",
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("services:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as {
    action?: string;
    ids?: string[];
  };
  if (body.action !== "approve_selected" && body.action !== "approve_all") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
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

  const proxied = await proxyPython("/api/v1/admin/services/bulk-approve", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }

  const outcomes: Array<{ id: string; ok: boolean; message?: string }> = [];
  for (const id of ids) {
    const { data, error } = await auth.context.client
      .from("services")
      .update({ published: true })
      .eq("id", id)
      .eq("published", false)
      .select("id")
      .maybeSingle();
    if (error) {
      outcomes.push({ id, ok: false, message: error.message });
    } else {
      outcomes.push({
        id,
        ok: true,
        message: data ? "Approved and published" : "Already published",
      });
    }
  }
  return NextResponse.json({
    ok: true,
    outcomes,
    approved: outcomes.filter((o) => o.ok).map((o) => o.id),
    failed: outcomes.filter((o) => !o.ok),
    source: "admin_local_fallback",
  });
}
