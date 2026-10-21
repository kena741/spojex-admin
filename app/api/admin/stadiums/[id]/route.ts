import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

const allowed = [
  "name",
  "slug",
  "location",
  "address",
  "subcity",
  "wereda",
  "latitude",
  "longitude",
  "size_type",
  "surface",
  "capacity",
  "photos",
  "image_url",
  "facilities",
  "description",
  "owner_name",
  "owner_user_id",
  "contact_phone",
  "contact_email",
  "status",
  "pricing",
  "location_review_needed",
] as const;

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if ("subcity" in patch) {
    patch.subcity = `${patch.subcity ?? ""}`.trim();
  }
  if ("wereda" in patch) {
    const raw = patch.wereda;
    if (raw == null || raw === "") {
      patch.wereda = null;
    } else {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/\D+/g, ""));
      patch.wereda = Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }
  const { data, error: updateError } = await auth.context.client
    .from("stadiums")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    const message = updateError.message || "Update failed";
    const lower = message.toLowerCase();
    const unauthorized =
      lower.includes("sign in") ||
      lower.includes("unauthorized") ||
      lower.includes("not authenticated") ||
      lower.includes("invalid token");
    return NextResponse.json(
      {
        error: unauthorized
          ? "Your admin session expired. Sign in again, then retry saving the stadium."
          : hint
            ? `${message}. ${hint}`
            : message,
      },
      { status: unauthorized ? 401 : 400 },
    );
  }
  return NextResponse.json({ data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const force = new URL(request.url).searchParams.get("force") === "true";

  const proxied = await proxyPython(
    `/api/v1/admin/stadiums/${id}/archive?force=${force ? "true" : "false"}`,
    { method: "POST" },
  );
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }
  if (proxied && proxied.res.status >= 400 && proxied.res.status !== 404) {
    return NextResponse.json(
      {
        error:
          (proxied.payload as { error?: string; message?: string }).error ||
          (proxied.payload as { message?: string }).message ||
          "Archive failed",
      },
      { status: proxied.res.status },
    );
  }

  // Local soft-archive fallback: deactivate when history exists.
  const [{ count: bookingCount }, { count: payCount }, { count: subCount }] = await Promise.all([
    auth.context.client
      .from("stadium_bookings")
      .select("id", { count: "exact", head: true })
      .eq("stadium_id", id),
    auth.context.client
      .from("stadium_payments")
      .select("id", { count: "exact", head: true })
      .eq("stadium_id", id),
    auth.context.client
      .from("stadium_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("stadium_id", id),
  ]);
  const deps = {
    bookings: bookingCount ?? 0,
    payments: payCount ?? 0,
    subscriptions: subCount ?? 0,
  };
  if (deps.bookings > 0 || deps.payments > 0 || deps.subscriptions > 0) {
    const { data, error } = await auth.context.client
      .from("stadiums")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      archived: true,
      deleted: false,
      data,
      dependencies: deps,
      message: "Deactivated. Bookings, subscriptions, and payments preserved.",
      source: "admin_local_fallback",
    });
  }

  const { error: deleteError } = await auth.context.client.from("stadiums").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    archived: false,
    deleted: true,
    dependencies: deps,
    source: "admin_local_fallback",
  });
}
