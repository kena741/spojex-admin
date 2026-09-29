import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { bookingEmbedFallback, bookingEmbedSelect, isMissingRelation } from "@/lib/marketplace";

export async function GET() {
  const auth = await requireAdminPermission("requests:read");
  if (!auth.ok) return auth.error;
  const rich = await auth.context.client
    .from("service_requests")
    .select(bookingEmbedSelect)
    .order("created_at", { ascending: false })
    .limit(500);
  if (!rich.error) {
    return NextResponse.json({ data: rich.data ?? [] });
  }
  if (!isMissingRelation(rich.error.message)) {
    return NextResponse.json({ error: rich.error.message }, { status: 400 });
  }
  const fallback = await auth.context.client
    .from("service_requests")
    .select(bookingEmbedFallback)
    .order("created_at", { ascending: false })
    .limit(500);
  if (fallback.error) {
    return NextResponse.json({ error: fallback.error.message }, { status: 400 });
  }
  return NextResponse.json({ data: fallback.data ?? [] });
}
