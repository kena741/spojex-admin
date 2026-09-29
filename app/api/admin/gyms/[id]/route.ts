import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";
import {
  gymFeatureStatuses,
  gymStatuses,
  gymVerificationStatuses,
  type GymFeatureStatus,
  type GymStatus,
  type GymVerificationStatus,
} from "@/lib/gyms";
import { requestAccessToken } from "@/lib/supabase/server";

const allowed = [
  "status",
  "verification_status",
  "monthly_payment",
  "name",
  "description",
  "location",
  "address",
  "city",
  "country",
  "category",
  "contact_phone",
  "contact_email",
  "website",
  "logo_url",
  "cover_url",
  "owner_name",
  "owner_user_id",
  "is_featured",
  "feature_status",
] as const;

const allowedStatuses = new Set(gymStatuses.map((item) => item.id));
const allowedVerification = new Set(gymVerificationStatuses.map((item) => item.id));
const allowedFeature = new Set(gymFeatureStatuses.map((item) => item.id));

const gymSelect =
  "*, users:owner_user_id(id, display_name, email, role, phone)";

function featuredPatch(opts: {
  isFeatured?: boolean;
  featureStatus?: GymFeatureStatus;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  if (opts.isFeatured === true) {
    return {
      is_featured: true,
      feature_status: "approved",
      feature_reviewed_at: now,
    };
  }
  if (opts.isFeatured === false) {
    return {
      is_featured: false,
      feature_status: opts.featureStatus ?? "none",
      feature_reviewed_at: now,
    };
  }
  if (opts.featureStatus === "approved") {
    return {
      is_featured: true,
      feature_status: "approved",
      feature_reviewed_at: now,
    };
  }
  if (opts.featureStatus === "rejected") {
    return {
      is_featured: false,
      feature_status: "rejected",
      feature_reviewed_at: now,
    };
  }
  if (opts.featureStatus === "pending") {
    return {
      is_featured: false,
      feature_status: "pending",
      feature_requested_at: now,
    };
  }
  if (opts.featureStatus === "none") {
    return {
      is_featured: false,
      feature_status: "none",
      feature_reviewed_at: now,
    };
  }
  return {};
}

// The featured guard allows the signed-in admin (auth.uid()), and ignores
// service-role writes where auth.uid() is null. Featured updates must use
// the caller's session.
async function featuredWriter(service: SupabaseClient) {
  const token = await requestAccessToken();
  if (!token) return service;
  return createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function featuredIgnored(
  patch: Record<string, unknown>,
  row: { is_featured?: boolean | null; feature_status?: string | null },
) {
  if ("is_featured" in patch && Boolean(row.is_featured) !== Boolean(patch.is_featured)) {
    return true;
  }
  if (
    "feature_status" in patch &&
    String(row.feature_status ?? "") !== String(patch.feature_status ?? "")
  ) {
    return true;
  }
  return false;
}

async function writeGym(service: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const touchesFeatured = "is_featured" in patch || "feature_status" in patch;
  const writer = touchesFeatured ? await featuredWriter(service) : service;
  const { data, error } = await writer
    .from("gyms")
    .update(patch)
    .eq("id", id)
    .select(touchesFeatured ? "id, is_featured, feature_status" : gymSelect)
    .maybeSingle();
  if (error) return { error: error.message, status: 400, row: null };
  if (!data) return { error: "Gym not found", status: 404, row: null };
  if (touchesFeatured && featuredIgnored(patch, data)) {
    return { error: "Featured status was not saved.", status: 400, row: null };
  }
  if (!touchesFeatured) return { error: null, status: 200, row: data };
  const refreshed = await service.from("gyms").select(gymSelect).eq("id", id).maybeSingle();
  if (refreshed.error) return { error: refreshed.error.message, status: 400, row: null };
  if (!refreshed.data) return { error: "Gym not found", status: 404, row: null };
  return { error: null, status: 200, row: refreshed.data };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const [gymRes, staffRes, membersRes] = await Promise.all([
    auth.context.client.from("gyms").select(gymSelect).eq("id", id).maybeSingle(),
    auth.context.client
      .from("gym_staff")
      .select("*, users:user_id(id, display_name, email, role, phone)")
      .eq("gym_id", id)
      .order("created_at", { ascending: false }),
    auth.context.client
      .from("gym_members")
      .select(
        "*, users:user_id(id, display_name, email, role, phone), gym_memberships(id, status, start_date, end_date, gym_plans(title))",
      )
      .eq("gym_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  if (gymRes.error) {
    return NextResponse.json({ error: gymRes.error.message }, { status: 400 });
  }
  if (!gymRes.data) {
    return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  }

  let staff = staffRes.data ?? [];
  let staffError = staffRes.error?.message ?? null;
  if (staffRes.error) {
    staff = [];
  }

  let members = membersRes.data ?? [];
  let membersError = membersRes.error?.message ?? null;
  if (membersRes.error) {
    // Fallback without memberships embed if relation/select fails
    const fallback = await auth.context.client
      .from("gym_members")
      .select("*, users:user_id(id, display_name, email, role, phone)")
      .eq("gym_id", id)
      .order("created_at", { ascending: false })
      .limit(300);
    if (fallback.error) {
      members = [];
      membersError = fallback.error.message;
    } else {
      members = fallback.data ?? [];
      membersError = null;
    }
  }

  return NextResponse.json({
    data: gymRes.data,
    staff,
    members,
    staff_error: staffError,
    members_error: membersError,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  if (body.action === "review_featured") {
    const approve = body.approve === true;
    const patch = featuredPatch({
      featureStatus: approve ? "approved" : "rejected",
    });
    const saved = await writeGym(auth.context.client, id, patch);
    if (saved.error || !saved.row) {
      return NextResponse.json(
        { error: saved.error || "Gym not found" },
        { status: saved.status },
      );
    }
    return NextResponse.json({ ok: true, gym: saved.row, data: saved.row });
  }

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if ("monthly_payment" in patch) {
    const raw = Number(patch.monthly_payment);
    if (!Number.isFinite(raw) || raw < 0) {
      return NextResponse.json(
        { error: "monthly_payment must be a non-negative number" },
        { status: 400 },
      );
    }
    patch.monthly_payment = raw;
  }
  if ("status" in patch) {
    const status = String(patch.status ?? "");
    if (!allowedStatuses.has(status as GymStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
  }
  if ("verification_status" in patch) {
    const verification = String(patch.verification_status ?? "");
    if (!allowedVerification.has(verification as GymVerificationStatus)) {
      return NextResponse.json({ error: "Invalid verification_status" }, { status: 400 });
    }
  }
  if ("is_featured" in patch || "feature_status" in patch) {
    const isFeatured =
      "is_featured" in patch ? Boolean(patch.is_featured) : undefined;
    const featureStatus = (
      "feature_status" in patch ? String(patch.feature_status ?? "") : undefined
    ) as GymFeatureStatus | undefined;
    if (featureStatus && !allowedFeature.has(featureStatus)) {
      return NextResponse.json({ error: "Invalid feature_status" }, { status: 400 });
    }
    Object.assign(patch, featuredPatch({ isFeatured, featureStatus }));
  }
  if ("owner_user_id" in patch && patch.owner_user_id) {
    const ownerId = String(patch.owner_user_id);
    const { data: ownerRow, error: ownerError } = await auth.context.client
      .from("users")
      .select("id, display_name, email")
      .eq("id", ownerId)
      .maybeSingle();
    if (ownerError) {
      return NextResponse.json({ error: ownerError.message }, { status: 400 });
    }
    if (!ownerRow?.id) {
      return NextResponse.json({ error: "Owner user not found" }, { status: 400 });
    }
    if (!("owner_name" in patch) || !String(patch.owner_name ?? "").trim()) {
      patch.owner_name = ownerRow.display_name?.trim() || ownerRow.email || "";
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }
  const saved = await writeGym(auth.context.client, id, patch);
  if (saved.error || !saved.row) {
    return NextResponse.json(
      { error: saved.error || "Gym not found" },
      { status: saved.status },
    );
  }
  const data = saved.row;

  if (patch.owner_user_id) {
    await auth.context.client.from("gym_staff").upsert(
      {
        gym_id: id,
        user_id: String(patch.owner_user_id),
        staff_role: "owner",
        is_active: true,
      },
      { onConflict: "gym_id,user_id" },
    );
    await auth.context.client.rpc("ensure_gym_organization", {
      p_gym_id: id,
    });
    const refreshed = await auth.context.client
      .from("gyms")
      .select(gymSelect)
      .eq("id", id)
      .maybeSingle();
    if (refreshed.data) {
      return NextResponse.json({
        ok: true,
        gym: refreshed.data,
        data: refreshed.data,
      });
    }
  }

  return NextResponse.json({ ok: true, gym: data, data });
}
