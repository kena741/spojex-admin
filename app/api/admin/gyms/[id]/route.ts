import type { SpojexClient } from "@/lib/api/client";
import { createSpojexClient } from "@/lib/api/client";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { ensureGymOrganizationViaTables } from "@/lib/ensure-gym-organization";
import { getSpojexApiBaseUrl } from "@/lib/env";
import {
  gymFeatureStatuses,
  gymStatuses,
  gymVerificationStatuses,
  type GymFeatureStatus,
  type GymStatus,
  type GymVerificationStatus,
} from "@/lib/gyms";
import { requestAccessToken } from "@/lib/spojex/server";

const PYTHON_ACTIONS = new Set([
  "approve_listing",
  "mark_under_review",
  "revoke_verification",
  "activate_listing",
  "deactivate_listing",
  "reject_listing",
  "suspend",
  "reactivate",
  "feature_approve",
  "feature_reject",
  "feature_toggle",
  "transfer_ownership",
]);

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
async function featuredWriter(service: SpojexClient) {
  const token = await requestAccessToken();
  if (!token) return service;
  return createSpojexClient({
    getSession: () => ({
      access_token: token,
      refresh_token: "",
      token_type: "bearer",
      user: { id: "", aud: "authenticated", user_metadata: {}, app_metadata: {} },
    }),
    saveSession: () => undefined,
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

async function writeGym(service: SpojexClient, id: string, patch: Record<string, unknown>) {
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

  const [gymRes, staffRes, membersRes, plansRes] = await Promise.all([
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
    auth.context.client
      .from("gym_plans")
      .select("*")
      .eq("gym_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
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

  let plans = plansRes.data ?? [];
  let plansError = plansRes.error?.message ?? null;
  if (plansRes.error) {
    plans = [];
  }

  // Payments summary for Finance tab (customer memberships — not platform fee invoices).
  const paymentsRes = await auth.context.client
    .from("gym_payments")
    .select(
      "id, amount, currency, commission_pct, commission_amount, gym_net_amount, payment_type, status, paid_at, created_at, membership_id, plan_id",
    )
    .eq("gym_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    data: gymRes.data,
    staff,
    members,
    plans,
    payments: paymentsRes.data ?? [],
    staff_error: staffError,
    members_error: membersError,
    plans_error: plansError,
    payments_error: paymentsRes.error?.message ?? null,
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
    body.action = body.approve === true ? "feature_approve" : "feature_reject";
  }

  if (typeof body.action === "string" && PYTHON_ACTIONS.has(body.action)) {
    const token = await requestAccessToken();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const res = await fetch(`${getSpojexApiBaseUrl()}/api/v1/admin/gyms/${id}/actions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: body.action,
        reason: body.reason ?? null,
        idempotency_key: body.idempotency_key ?? null,
        owner_user_id: body.owner_user_id ?? null,
      }),
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            (payload as { error?: string; message?: string }).message ||
            (payload as { error?: string }).error ||
            "Action failed",
        },
        { status: res.status },
      );
    }
    // Refresh full gym row for the UI
    const refreshed = await auth.context.client
      .from("gyms")
      .select(gymSelect)
      .eq("id", id)
      .maybeSingle();
    return NextResponse.json({
      ok: true,
      ...(payload as object),
      gym: refreshed.data,
      data: refreshed.data,
    });
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
  if ("status" in patch || "verification_status" in patch || "feature_status" in patch || "is_featured" in patch) {
    const current = await auth.context.client
      .from("gyms")
      .select("status, verification_status, feature_status, is_featured")
      .eq("id", id)
      .maybeSingle();
    if (current.error) {
      return NextResponse.json({ error: current.error.message }, { status: 400 });
    }
    if (!current.data) {
      return NextResponse.json({ error: "Gym not found" }, { status: 404 });
    }
    const nextStatus = String(patch.status ?? current.data.status ?? "");
    const nextVerification = String(
      patch.verification_status ?? current.data.verification_status ?? "",
    );
    // Reject no-op "Approve" on already active+verified gyms.
    if (
      "status" in patch &&
      "verification_status" in patch &&
      current.data.status === "active" &&
      current.data.verification_status === "verified" &&
      nextStatus === "active" &&
      nextVerification === "verified"
    ) {
      return NextResponse.json(
        { error: "Gym is already active and verified; Approve is not applicable." },
        { status: 400 },
      );
    }
    // Suspension must set listing inactive and verification suspended together.
    if (
      nextVerification === "suspended" &&
      nextStatus !== "inactive" &&
      nextStatus !== "rejected"
    ) {
      return NextResponse.json(
        { error: "Suspended verification requires inactive (or rejected) listing status." },
        { status: 400 },
      );
    }
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
  let previousOwnerId: string | null = null;
  if ("owner_user_id" in patch) {
    const ownerId = String(patch.owner_user_id ?? "").trim();
    if (!ownerId) {
      return NextResponse.json(
        { error: "Owner must be an existing SpoJex user." },
        { status: 400 },
      );
    }
    patch.owner_user_id = ownerId;
    const { data: ownerRow, error: ownerError } = await auth.context.client
      .from("users")
      .select("id, display_name, email")
      .eq("id", ownerId)
      .maybeSingle();
    if (ownerError) {
      return NextResponse.json({ error: ownerError.message }, { status: 400 });
    }
    if (!ownerRow?.id) {
      return NextResponse.json(
        { error: "Owner user not found. Pick an existing SpoJex account." },
        { status: 400 },
      );
    }
    if (!("owner_name" in patch) || !String(patch.owner_name ?? "").trim()) {
      patch.owner_name = ownerRow.display_name?.trim() || ownerRow.email || "";
    }
    const { data: currentGym } = await auth.context.client
      .from("gyms")
      .select("owner_user_id")
      .eq("id", id)
      .maybeSingle();
    previousOwnerId = currentGym?.owner_user_id
      ? String(currentGym.owner_user_id)
      : null;
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
    const nextOwnerId = String(patch.owner_user_id);
    // Clear stale permission overrides so assigned owners keep videos.upload etc.
    await auth.context.client.from("gym_staff").upsert(
      {
        gym_id: id,
        user_id: nextOwnerId,
        staff_role: "owner",
        is_active: true,
        permissions: {},
      },
      { onConflict: "gym_id,user_id" },
    );
    // Previous owner keeps access as manager (not removed from staff).
    if (previousOwnerId && previousOwnerId !== nextOwnerId) {
      await auth.context.client
        .from("gym_staff")
        .update({ staff_role: "manager", is_active: true })
        .eq("gym_id", id)
        .eq("user_id", previousOwnerId)
        .eq("staff_role", "owner");
    }
    const ens = await auth.context.client.rpc("ensure_gym_organization", {
      p_gym_id: id,
    });
    if (ens.error) {
      await ensureGymOrganizationViaTables(auth.context.client, id);
    }
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
