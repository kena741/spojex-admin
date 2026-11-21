import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import {
  athleteRoles,
  categoryFor,
  mediaRoles,
  professionalRoles,
} from "@/lib/catalog";
import { createAdminClient } from "@/lib/spojex/admin";

export const dynamic = "force-dynamic";

type ProfileKind = "athlete" | "professional" | "media" | "fan" | "all";

const ATHLETE_ROLE_SLUGS = ["athlete", "player", ...athleteRoles.map((r) => r.id)];
const PROFESSIONAL_ROLE_SLUGS = [
  "professional",
  ...professionalRoles.map((r) => r.id),
];
const MEDIA_ROLE_SLUGS = ["media", ...mediaRoles.map((r) => r.id)];

const MEDIA_CATEGORY_SLUGS = mediaRoles.map((r) => r.id);
const PROFESSIONAL_CATEGORY_SLUGS = professionalRoles.map((r) => r.id);

/**
 * Paginated People directory with summary KPIs.
 * Profile-type filter matches active ``user_role_assignments`` (M7 SoT),
 * not only the ``users.role`` primary mirror.
 */
export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["users:read", "profiles:read"]);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().replace(/[%(),]/g, " ");
  const profile = (url.searchParams.get("profile") ?? "all") as ProfileKind;
  const verified = (url.searchParams.get("verified") ?? "all").trim();
  const status = (url.searchParams.get("status") ?? "active").trim(); // active | restricted | all
  const orgId = (url.searchParams.get("org_id") ?? "").trim();
  const registeredFrom = (url.searchParams.get("from") ?? "").trim();
  const registeredTo = (url.searchParams.get("to") ?? "").trim();
  const sort = (url.searchParams.get("sort") ?? "created_at").trim();
  const order = (url.searchParams.get("order") ?? "desc").toLowerCase() === "asc";
  const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get("page_size") ?? 30) || 30, 1), 100);
  const offset = (page - 1) * pageSize;

  const client = createAdminClient();

  // Summary KPIs (stock + period)
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  const [totalRes, newRes, pendingVerRes] = await Promise.all([
    client.from("users").select("id", { count: "exact", head: true }).is("deleted_at", null),
    client
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", since30.toISOString()),
    // Unverified people (not only submitted identity_verification_requests).
    client
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("verified", false),
  ]);

  // Restricted = soft-deleted in last 90d (visible when status=restricted)
  const restrictedRes = await client
    .from("users")
    .select("id", { count: "exact", head: true })
    .not("deleted_at", "is", null);

  const summary = {
    total_people: totalRes.count ?? 0,
    new_registrations_30d: newRes.count ?? 0,
    pending_verifications: pendingVerRes.count ?? 0,
    restricted_accounts: restrictedRes.count ?? 0,
  };

  // Optional: users in an org (owner or member)
  let orgUserIds: string[] | null = null;
  if (orgId) {
    const ids = new Set<string>();
    const owner = await client.from("organizations").select("user_id").eq("id", orgId).maybeSingle();
    if (owner.data?.user_id) ids.add(String(owner.data.user_id));
    const members = await client
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .limit(2000);
    for (const m of members.data ?? []) {
      if (m.user_id) ids.add(String(m.user_id));
    }
    orgUserIds = [...ids];
    if (!orgUserIds.length) {
      return NextResponse.json({
        summary,
        data: [],
        total: 0,
        page,
        page_size: pageSize,
      });
    }
  }

  let query = client
    .from("users")
    .select(
      "id, user_id, display_name, full_name, username, email, phone, role, avatar_url, verified, city, country, created_at, updated_at, deleted_at",
      { count: "exact" },
    );

  if (status === "active") query = query.is("deleted_at", null);
  else if (status === "restricted") query = query.not("deleted_at", "is", null);

  if (verified === "yes") query = query.eq("verified", true);
  if (verified === "no") query = query.eq("verified", false);

  if (registeredFrom) query = query.gte("created_at", registeredFrom);
  if (registeredTo) query = query.lte("created_at", registeredTo);

  if (orgUserIds) query = query.in("id", orgUserIds);

  // Assignment-backed profile filter (includes secondary roles).
  if (profile !== "all") {
    let assignQuery = client
      .from("user_role_assignments")
      .select("user_id")
      .eq("status", "active");
    if (profile === "athlete") {
      assignQuery = assignQuery.eq("account_role", "athlete");
    } else if (profile === "fan") {
      assignQuery = assignQuery.eq("account_role", "fan");
    } else if (profile === "media") {
      assignQuery = assignQuery
        .eq("account_role", "professional")
        .in("category_slug", MEDIA_CATEGORY_SLUGS);
    } else if (profile === "professional") {
      // Professionals excluding media categories (those have their own filter).
      assignQuery = assignQuery.eq("account_role", "professional");
      if (MEDIA_CATEGORY_SLUGS.length) {
        // PostgREST: not.in when possible; fall back to all professional then exclude in JS if needed.
        assignQuery = assignQuery.not(
          "category_slug",
          "in",
          `(${MEDIA_CATEGORY_SLUGS.join(",")})`,
        );
      }
    }

    const { data: assigns, error: assignError } = await assignQuery.limit(5000);
    if (assignError) {
      // Fallback to legacy users.role mirror when assignments table is unavailable.
      if (profile === "athlete") query = query.in("role", ATHLETE_ROLE_SLUGS);
      else if (profile === "professional") query = query.in("role", PROFESSIONAL_ROLE_SLUGS);
      else if (profile === "media") query = query.in("role", MEDIA_ROLE_SLUGS);
      else if (profile === "fan") {
        query = query.in("role", [
          "fan",
          "supporter",
          "community",
          "parent",
          "guardian",
          "parent_guardian",
        ]);
      }
    } else {
      const ids = [
        ...new Set(
          (assigns ?? [])
            .map((row) => String((row as { user_id?: string }).user_id ?? "").trim())
            .filter(Boolean),
        ),
      ];
      if (!ids.length) {
        return NextResponse.json({
          summary,
          data: [],
          total: 0,
          page,
          page_size: pageSize,
        });
      }
      query = query.in("id", ids);
    }
  }

  if (q.length >= 1) {
    query = query.or(
      `display_name.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%,username.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  }

  const sortCol = ["created_at", "updated_at", "display_name", "full_name"].includes(sort)
    ? sort
    : "created_at";
  query = query.order(sortCol, { ascending: order }).range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => String(r.id));

  // Owned org names (compact)
  const orgByOwner: Record<string, { id: string; name: string }[]> = {};
  if (ids.length) {
    const { data: orgs } = await client
      .from("organizations")
      .select("id, name, user_id")
      .in("user_id", ids)
      .limit(500);
    for (const o of orgs ?? []) {
      const uid = String(o.user_id);
      if (!orgByOwner[uid]) orgByOwner[uid] = [];
      orgByOwner[uid].push({ id: String(o.id), name: String(o.name) });
    }
  }

  // Latest verification request status
  const verByUser: Record<string, string> = {};
  if (ids.length) {
    const { data: vers } = await client
      .from("identity_verification_requests")
      .select("user_id, status, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(ids.length * 3);
    for (const v of vers ?? []) {
      const uid = String(v.user_id);
      if (!verByUser[uid]) verByUser[uid] = String(v.status);
    }
  }

  // Active assignment badges (multi-role) — prefer SoT over users.role mirror.
  const roleByUser: Record<string, string[]> = {};
  if (ids.length) {
    const { data: activeRoles } = await client
      .from("user_role_assignments")
      .select("user_id, account_role, category_slug, is_primary")
      .in("user_id", ids)
      .eq("status", "active")
      .limit(ids.length * 5);
    for (const row of activeRoles ?? []) {
      const uid = String((row as { user_id?: string }).user_id ?? "");
      if (!uid) continue;
      const account = String((row as { account_role?: string }).account_role ?? "");
      const category = String((row as { category_slug?: string }).category_slug ?? "");
      let badge = account;
      if (account === "professional" && MEDIA_CATEGORY_SLUGS.includes(category)) {
        badge = "media";
      } else if (
        account === "professional" &&
        (PROFESSIONAL_CATEGORY_SLUGS.includes(category) || !category)
      ) {
        badge = "professional";
      } else if (account === "athlete") {
        badge = "athlete";
      } else if (account === "fan") {
        badge = "fan";
      }
      if (!roleByUser[uid]) roleByUser[uid] = [];
      if (badge && !roleByUser[uid].includes(badge)) roleByUser[uid].push(badge);
    }
  }

  const enriched = rows.map((r) => {
    const id = String(r.id);
    const badges = roleByUser[id] ?? [];
    if (!badges.length) {
      const cat = categoryFor(r.role == null ? null : String(r.role));
      if (cat === "athlete" || cat === "professional" || cat === "media") {
        badges.push(cat);
      }
    }
    return {
      ...r,
      profile_types: badges.filter((b) => b === "athlete" || b === "professional" || b === "media"),
      organizations: orgByOwner[id] ?? [],
      verification_request_status: verByUser[id] ?? null,
      account_status: r.deleted_at ? "restricted" : "active",
      last_activity_at: r.updated_at ?? null,
      last_activity_tracked: Boolean(r.updated_at),
    };
  });

  return NextResponse.json({
    summary,
    data: enriched,
    total: count ?? enriched.length,
    page,
    page_size: pageSize,
  });
}
