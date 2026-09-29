import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";

const allowed = [
  "display_name",
  "full_name",
  "username",
  "role",
  "headline",
  "bio",
  "country",
  "city",
  "currency",
  "website",
  "phone",
  "email",
  "verified",
  "avatar_url",
  "cover_url",
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json()) as Record<string, unknown>;
  const permission = body.verified !== undefined && Object.keys(body).length === 1 ? "users:verify" : "users:write";
  const auth = await requireAdminPermission(permission);
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }
  const { data, error: updateError } = await auth.context.client.from("users").update(patch).eq("id", id).select().maybeSingle();
  if (updateError) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${updateError.message}. ${hint}` : updateError.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
