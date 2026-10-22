import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("gyms:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/gyms/${id}/community`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
    } catch {
      // local
    }
  }

  const { data: gym } = await auth.context.client
    .from("gyms")
    .select("id, organization_id, name")
    .eq("id", id)
    .maybeSingle();
  if (!gym) return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  if (!gym.organization_id) {
    return NextResponse.json({
      linked: false,
      configuration_state: "no_organization",
      note: "This gym has no linked organization, so there is no canonical gym chat room.",
      source: "local",
    });
  }
  return NextResponse.json({
    linked: true,
    organization: { id: gym.organization_id, href: `/admin/organizations/${gym.organization_id}` },
    configuration_state: "organization_linked",
    note: "Full chat metadata requires the Python community endpoint.",
    messages_available: false,
    source: "local",
  });
}
