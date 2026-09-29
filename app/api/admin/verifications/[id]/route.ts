import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import { fallbackRequirementsForRole } from "@/lib/verification-docs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("users:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data, error } = await auth.context.client
    .from("identity_verification_requests")
    .select(
      "*, users!identity_verification_requests_user_id_fkey(id, display_name, full_name, role, avatar_url, verified), identity_verification_documents(*)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const docs = Array.isArray(data.identity_verification_documents)
    ? data.identity_verification_documents
    : [];
  const paths = docs
    .map((doc: { storage_path?: string }) =>
      typeof doc.storage_path === "string" ? doc.storage_path : "",
    )
    .filter(Boolean);

  let signed: { path: string; signedUrl: string }[] = [];
  if (paths.length > 0) {
    const { data: signedData, error: signedError } = await auth.context.client.storage
      .from("identity-docs")
      .createSignedUrls(paths, 60 * 60);
    if (signedError) {
      return NextResponse.json({ error: signedError.message }, { status: 400 });
    }
    signed = (signedData ?? [])
      .filter((item) => item.path && item.signedUrl)
      .map((item) => ({ path: item.path as string, signedUrl: item.signedUrl as string }));
  }

  const urlByPath = new Map(signed.map((item) => [item.path, item.signedUrl]));
  const documents = docs.map((doc: { storage_path?: string }) => ({
    ...doc,
    signed_url: urlByPath.get(doc.storage_path ?? "") ?? "",
  }));

  const role = typeof data.users === "object" && data.users && !Array.isArray(data.users)
    ? String((data.users as { role?: string }).role ?? "")
    : "";
  let requirements = fallbackRequirementsForRole(role);
  if (role) {
    const { data: reqRows, error: reqError } = await auth.context.client.rpc(
      "identity_verification_requirements",
      { p_role_slug: role },
    );
    if (!reqError && Array.isArray(reqRows) && reqRows.length > 0) {
      requirements = reqRows;
    }
  }

  return NextResponse.json({
    data: {
      ...data,
      identity_verification_documents: documents,
      role_requirements: requirements,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("users:verify");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as { status?: string; review_note?: string };
  const status = body.status?.trim();
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status must be approved or rejected" }, { status: 400 });
  }

  const { data, error } = await auth.context.client.rpc("review_identity_verification", {
    p_request_id: id,
    p_status: status,
    p_note: body.review_note?.trim() ?? "",
  });
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
