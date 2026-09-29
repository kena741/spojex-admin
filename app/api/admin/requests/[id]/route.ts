import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("requests:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as { status?: string };
  if (!body.status) return NextResponse.json({ error: "status is required" }, { status: 400 });
  const { data, error: updateError } = await auth.context.client
    .from("service_requests")
    .update({ status: body.status })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
