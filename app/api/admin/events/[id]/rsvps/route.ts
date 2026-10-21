import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

/** Admin disposition only — never overwrite user-reported going/declined via free edit. */
const ADMIN_DISPOSITIONS = new Set(["invited", "waitlisted", "cancelled"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data, error } = await auth.context.client
    .from("event_rsvps")
    .select("*, users:user_id(id, display_name, email, phone)")
    .eq("event_id", id)
    .order("invited_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.message.toLowerCase().includes("event_rsvps")) {
      return NextResponse.json({ data: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    user_id?: string;
    email?: string;
    status?: string;
  };

  let userId = body.user_id?.trim() ?? "";
  if (!userId && body.email?.trim()) {
    const email = body.email.trim().toLowerCase();
    const { data: user, error: userError } = await auth.context.client
      .from("users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 400 });
    }
    if (!user?.id) {
      return NextResponse.json({ error: "No Spojex user found for that email." }, { status: 404 });
    }
    userId = user.id;
  }
  if (!userId) {
    return NextResponse.json({ error: "user_id or email is required" }, { status: 400 });
  }

  // Prevent duplicate invitations / notification retries for an existing RSVP.
  const { data: existing } = await auth.context.client
    .from("event_rsvps")
    .select("id, status")
    .eq("event_id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.id) {
    return NextResponse.json(
      {
        error: "Guest already has an RSVP for this event. Re-invite is blocked to avoid duplicate notifications.",
        data: existing,
      },
      { status: 409 },
    );
  }

  const status = body.status?.trim() || "invited";
  if (!ADMIN_DISPOSITIONS.has(status) && status !== "invited") {
    return NextResponse.json(
      { error: "New invitations must start as invited (or waitlisted)." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.context.client
    .from("event_rsvps")
    .insert({
      event_id: id,
      user_id: userId,
      status: status === "waitlisted" ? "waitlisted" : "invited",
      invited_at: new Date().toISOString(),
    })
    .select("*, users:user_id(id, display_name, email, phone)")
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as { rsvp_id?: string; status?: string };
  const rsvpId = body.rsvp_id?.trim();
  const status = body.status?.trim();
  if (!rsvpId || !status) {
    return NextResponse.json({ error: "rsvp_id and status are required" }, { status: 400 });
  }
  if (!ADMIN_DISPOSITIONS.has(status)) {
    return NextResponse.json(
      {
        error:
          "Admin may only set invitation disposition (invited / waitlisted / cancelled). User going/declined responses are not editable here.",
      },
      { status: 400 },
    );
  }

  const { data: current } = await auth.context.client
    .from("event_rsvps")
    .select("id, status, responded_at")
    .eq("id", rsvpId)
    .eq("event_id", id)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
  }

  // Do not clobber a user's going/declined response with invited/waitlisted.
  const userResponse = new Set(["going", "declined", "viewed"]);
  if (userResponse.has((current.status ?? "").toLowerCase()) && status !== "cancelled") {
    return NextResponse.json(
      {
        error: `Cannot change user response "${current.status}" except to cancel the invitation.`,
      },
      { status: 409 },
    );
  }

  const { data, error } = await auth.context.client
    .from("event_rsvps")
    .update({
      status,
      // Disposition changes are admin actions — do not rewrite responded_at for user answers.
    })
    .eq("id", rsvpId)
    .eq("event_id", id)
    .select("*, users:user_id(id, display_name, email, phone)")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("events:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const rsvpId = new URL(request.url).searchParams.get("rsvp_id")?.trim();
  if (!rsvpId) {
    return NextResponse.json({ error: "rsvp_id is required" }, { status: 400 });
  }

  const { error } = await auth.context.client
    .from("event_rsvps")
    .delete()
    .eq("id", rsvpId)
    .eq("event_id", id);

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
