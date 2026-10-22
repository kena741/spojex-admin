import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission, requireAnyAdminPermission } from "@/lib/admin-auth";
import { logAdminActivity } from "@/lib/admin-activity-log";
import { organizationTypes } from "@/lib/catalog";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

const allowedTypes = new Set(organizationTypes.map((item) => item.id));

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

/** Directory list with unique active member counts (owner counted once). */
export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["organizations:read", "organizations:write"]);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const proxied = await proxyPython(`/api/v1/admin/organizations?${url.searchParams}`);
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }

  const q = (url.searchParams.get("q") || "").trim();
  const type = url.searchParams.get("type") || "all";
  const verified = url.searchParams.get("verified") || "all";
  const ownerUserId = (url.searchParams.get("owner_user_id") || "").trim();
  const city = (url.searchParams.get("city") || "").trim();
  const country = (url.searchParams.get("country") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") || 40) || 40));

  let query = auth.context.client
    .from("organizations")
    .select("*, users:user_id(id, display_name, email, role, avatar_url)", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (type !== "all") query = query.eq("organization_type", type);
  if (verified === "yes") query = query.eq("verified", true);
  if (verified === "no") query = query.eq("verified", false);
  if (ownerUserId) query = query.eq("user_id", ownerUserId);
  if (city) query = query.ilike("city", `%${city}%`);
  if (country) query = query.ilike("country", `%${country}%`);
  if (q) {
    query = query.or(
      `name.ilike.%${q}%,public_id.ilike.%${q}%,city.ilike.%${q}%,country.ilike.%${q}%`,
    );
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  type OrgListRow = {
    id: string;
    user_id: string;
    verified?: boolean;
    organization_type?: string;
    users?: unknown;
  };
  const orgs = (data ?? []) as OrgListRow[];
  const orgIds = orgs.map((o: OrgListRow) => String(o.id));

  const membersRes = orgIds.length
    ? await auth.context.client
        .from("organization_members")
        .select("organization_id, user_id, status")
        .in("organization_id", orgIds)
        .eq("status", "active")
        .limit(10000)
    : { data: [] as Array<{ organization_id: string; user_id: string; status: string }> };

  const uniqueActive: Record<string, Set<string>> = {};
  for (const org of orgs) {
    uniqueActive[String(org.id)] = new Set([String(org.user_id)]);
  }
  for (const m of membersRes.data ?? []) {
    if (String(m.status).toLowerCase() !== "active") continue;
    const oid = String(m.organization_id);
    (uniqueActive[oid] ??= new Set()).add(String(m.user_id));
  }

  const memberCounts: Record<string, number> = {};
  for (const [oid, set] of Object.entries(uniqueActive)) {
    memberCounts[oid] = set.size;
  }

  // Global summary (not page-scoped)
  const [allOrgs, typeRows] = await Promise.all([
    auth.context.client.from("organizations").select("verified, user_id"),
    auth.context.client.from("organizations").select("organization_type"),
  ]);
  const all = (allOrgs.data ?? []) as Array<{ verified?: boolean; user_id?: string }>;
  const byType: Record<string, number> = {};
  for (const row of (typeRows.data ?? []) as Array<{ organization_type?: string }>) {
    const t = String(row.organization_type || "other");
    byType[t] = (byType[t] ?? 0) + 1;
  }

  const summary = {
    total: count ?? all.length,
    verified: all.filter((o) => o.verified).length,
    unverified: all.filter((o) => !o.verified).length,
    pending_verification: all.filter((o) => !o.verified).length,
    by_type: byType,
    missing_owner: all.filter((o) => !o.user_id).length,
  };

  return NextResponse.json({
    data: orgs,
    total: count ?? orgs.length,
    page,
    page_size: pageSize,
    member_counts: memberCounts,
    summary,
    source: "local",
    definitions: {
      people_count:
        "Unique active users: owner plus active organization_members (owner counted once).",
      live_gifts:
        "Sum of live_event_gifts.coins for events hosted by this org - not personal wallet totals.",
      gift_recipient_model:
        "Live gifts currently credit the organization owner's personal coin_wallets row.",
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("organizations:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    name?: string;
    organization_type?: string;
    country?: string;
    city?: string;
    currency?: string;
    description?: string;
    website?: string | null;
    verified?: boolean;
    verification_reason?: string;
    owner_user_id?: string;
    owner_email?: string;
    idempotency_key?: string;
  };

  // Prefer Python service for create (idempotency + membership)
  if (body.owner_user_id) {
    const proxied = await proxyPython("/api/v1/admin/organizations", {
      method: "POST",
      body: JSON.stringify({
        name: body.name,
        organization_type: body.organization_type || "club",
        owner_user_id: body.owner_user_id,
        city: body.city || "",
        country: body.country || "Ethiopia",
        currency: body.currency || "ETB",
        website: body.website || null,
        description: body.description || "",
        verified: Boolean(body.verified),
        verification_reason: body.verification_reason || null,
        idempotency_key: body.idempotency_key || null,
      }),
    });
    if (proxied?.res.ok) {
      return NextResponse.json({ ...proxied.payload, source: "python" });
    }
    if (proxied && proxied.res.status >= 400 && proxied.res.status < 500) {
      const detail =
        (proxied.payload as { detail?: { message?: string }; error?: string; message?: string })
          .detail?.message ||
        (proxied.payload as { error?: string }).error ||
        (proxied.payload as { message?: string }).message ||
        "Create failed";
      return NextResponse.json({ error: detail }, { status: proxied.res.status });
    }
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const organizationType = (body.organization_type?.trim() || "club").toLowerCase();
  if (!allowedTypes.has(organizationType)) {
    return NextResponse.json({ error: "Invalid organization type" }, { status: 400 });
  }

  let ownerUserId = body.owner_user_id?.trim() || "";
  const ownerEmail = body.owner_email?.trim().toLowerCase() || "";

  if (!ownerUserId && ownerEmail) {
    const { data: owner, error: ownerError } = await auth.context.client
      .from("users")
      .select("id")
      .ilike("email", ownerEmail)
      .maybeSingle();
    if (ownerError) {
      return NextResponse.json({ error: ownerError.message }, { status: 400 });
    }
    if (!owner?.id) {
      return NextResponse.json(
        { error: "No Spojex user found with that email. Create or invite the owner first." },
        { status: 400 },
      );
    }
    ownerUserId = owner.id;
  }

  if (!ownerUserId) {
    return NextResponse.json(
      { error: "Owner is required (pick a user or enter their email)" },
      { status: 400 },
    );
  }

  const { data: ownerRow, error: ownerCheckError } = await auth.context.client
    .from("users")
    .select("id")
    .eq("id", ownerUserId)
    .maybeSingle();
  if (ownerCheckError) {
    return NextResponse.json({ error: ownerCheckError.message }, { status: 400 });
  }
  if (!ownerRow?.id) {
    return NextResponse.json({ error: "Owner user not found" }, { status: 400 });
  }

  const idemKey = body.idempotency_key?.trim();
  if (idemKey) {
    const { data: recent } = await auth.context.client
      .from("organizations")
      .select("*, users:user_id(id, display_name, email, role)")
      .eq("user_id", ownerUserId)
      .ilike("name", name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent?.id) {
      const createdAt = new Date(recent.created_at).getTime();
      if (Date.now() - createdAt < 60_000) {
        return NextResponse.json({ data: recent, reused: true, source: "local" });
      }
    }
  }

  let verified = false;
  if (body.verified) {
    const verifyAuth = await requireAdminPermission("organizations:verify");
    if (!verifyAuth.ok) {
      return NextResponse.json(
        { error: "organizations:verify is required to mark verified on create" },
        { status: 403 },
      );
    }
    if (!body.verification_reason?.trim()) {
      return NextResponse.json(
        { error: "verification_reason is required when marking verified" },
        { status: 400 },
      );
    }
    verified = true;
  }

  const now = new Date().toISOString();
  const publicIdBase =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "org";
  const publicId = `${publicIdBase}-${crypto.randomUUID().slice(0, 8)}`;

  let website = body.website?.trim() || null;
  if (website && !/^https?:\/\//i.test(website)) {
    website = `https://${website}`;
  }

  const { data, error } = await auth.context.client
    .from("organizations")
    .insert({
      user_id: ownerUserId,
      name,
      organization_type: organizationType,
      country: body.country?.trim() || "Ethiopia",
      city: body.city?.trim() || "",
      currency: body.currency?.trim() || "ETB",
      description: body.description?.trim() || "",
      website,
      verified,
      is_platform: false,
      public_id: publicId,
      images: [],
      created_at: now,
      updated_at: now,
    })
    .select("*, users:user_id(id, display_name, email, role)")
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }

  const { error: memberError } = await auth.context.client.from("organization_members").upsert(
    {
      organization_id: data.id,
      user_id: ownerUserId,
      member_role: "owner",
      status: "active",
      joined_at: now,
    },
    { onConflict: "organization_id,user_id" },
  );

  await logAdminActivity({
    context: auth.context,
    request,
    action: "create",
    resource_type: "organization",
    resource_id: data.id,
    summary: `Created organization ${name}`,
    metadata: {
      organization_type: organizationType,
      owner_user_id: ownerUserId,
      verified,
      verification_reason: body.verification_reason?.trim() || null,
      membership_attached: !memberError,
      membership_error: memberError?.message ?? null,
    },
  });

  return NextResponse.json({
    data,
    membership_attached: !memberError,
    membership_error: memberError?.message ?? null,
    source: "local",
  });
}
