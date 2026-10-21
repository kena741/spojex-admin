import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/spojex/admin";

export const dynamic = "force-dynamic";

type ProfileKind = "athlete" | "professional" | "media" | "fan" | "all";

/**
 * Paginated People directory with summary KPIs.
 * Profile-type filter uses both users.role group and presence of profile table rows
 * (supports multi-profile identities without merging tables).
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
    client
      .from("identity_verification_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
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

  // Profile-type: collect user ids from profile tables when filtering
  let profileUserIds: string[] | null = null;
  if (profile === "athlete" || profile === "professional" || profile === "media") {
    const table =
      profile === "athlete"
        ? "athlete_profiles"
        : profile === "professional"
          ? "professional_profiles"
          : "media_profiles";
    const { data: prows } = await client.from(table).select("user_id").limit(5000);
    const idsFromProfiles = (prows ?? [])
      .map((r: { user_id?: string | null }) => String(r.user_id ?? ""))
      .filter(Boolean);
    profileUserIds = idsFromProfiles;
    if (!idsFromProfiles.length) {
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
  if (profileUserIds) query = query.in("id", profileUserIds);

  if (profile === "fan") {
    // Primary role fans / community without extra profile tables — soft filter by role
    query = query.in("role", ["fan", "supporter", "community", "parent", "guardian"]);
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

  // Multi-profile badges: presence in each profile table (do not merge records)
  const profileMap: Record<string, string[]> = {};
  for (const id of ids) profileMap[id] = [];

  if (ids.length) {
    const [athletes, pros, media] = await Promise.all([
      client.from("athlete_profiles").select("user_id").in("user_id", ids),
      client.from("professional_profiles").select("user_id").in("user_id", ids),
      client.from("media_profiles").select("user_id").in("user_id", ids),
    ]);
    for (const r of athletes.data ?? []) {
      const uid = String(r.user_id);
      if (profileMap[uid] && !profileMap[uid].includes("athlete")) profileMap[uid].push("athlete");
    }
    for (const r of pros.data ?? []) {
      const uid = String(r.user_id);
      if (profileMap[uid] && !profileMap[uid].includes("professional")) {
        profileMap[uid].push("professional");
      }
    }
    for (const r of media.data ?? []) {
      const uid = String(r.user_id);
      if (profileMap[uid] && !profileMap[uid].includes("media")) profileMap[uid].push("media");
    }
  }

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

  const enriched = rows.map((r) => {
    const id = String(r.id);
    const badges = profileMap[id] ?? [];
    // Always surface primary role category as badge if no extra profile rows
    if (!badges.length && r.role) {
      const role = String(r.role);
      if (["player", "athlete"].includes(role)) badges.push("athlete");
      else if (["photographer", "sports_journalist", "media"].includes(role)) badges.push("media");
      else if (
        ["coach", "agent", "scout", "physiotherapist", "administrator", "referee"].includes(role)
      ) {
        badges.push("professional");
      }
    }
    return {
      ...r,
      profile_types: badges,
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
