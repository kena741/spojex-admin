import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";
import { VERIFICATION_DOCUMENT_TYPE_SEEDS, VERIFICATION_ROLE_REQUIREMENT_SEEDS } from "@/lib/verification-docs";

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

/** Explicit catalog init only when identity_document_types is empty. */
export async function POST(request: Request) {
  const auth = await requireAdminPermission("profiles:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean };
  if (!body.confirm) {
    return NextResponse.json(
      { error: "confirm=true is required", code: "confirm_required" },
      { status: 400 },
    );
  }

  const proxied = await proxyPython("/api/v1/admin/verifications/catalog/seed", {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }
  if (proxied && proxied.res.status >= 400 && proxied.res.status < 500) {
    const detail =
      (proxied.payload as { detail?: { message?: string }; message?: string; error?: string })
        ?.detail?.message ||
      (proxied.payload as { message?: string })?.message ||
      (proxied.payload as { error?: string })?.error ||
      "Seed refused";
    return NextResponse.json(
      { error: detail, code: "seed_failed", source: "python" },
      { status: proxied.res.status },
    );
  }

  const { count, error: countError } = await auth.context.client
    .from("identity_document_types")
    .select("id", { count: "exact", head: true });
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: "Document types already exist. Seed refused to avoid overwriting policy.",
        code: "not_empty",
        existing: count,
      },
      { status: 400 },
    );
  }

  const typeRows = VERIFICATION_DOCUMENT_TYPE_SEEDS.map((item) => ({
    slug: item.slug,
    label: item.label,
    description: item.description,
    step: item.step,
    is_active: item.is_active,
    sort_order: item.sort_order,
  }));
  const { data: insertedTypes, error: typeError } = await auth.context.client
    .from("identity_document_types")
    .insert(typeRows)
    .select("id, slug");
  if (typeError) {
    return NextResponse.json({ error: typeError.message }, { status: 400 });
  }

  const idBySlug = new Map((insertedTypes ?? []).map((t) => [t.slug, t.id]));
  const reqRows = VERIFICATION_ROLE_REQUIREMENT_SEEDS.map((req) => {
    const docId = idBySlug.get(req.slug);
    if (!docId) return null;
    return {
      role_slug: req.role_slug,
      document_type_id: docId,
      is_required: req.is_required,
      description: req.description,
      sort_order: req.sort_order,
    };
  }).filter(Boolean);

  if (reqRows.length > 0) {
    const { error: reqError } = await auth.context.client
      .from("identity_role_document_requirements")
      .insert(reqRows);
    if (reqError) {
      return NextResponse.json({ error: reqError.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    ok: true,
    types_inserted: insertedTypes?.length ?? 0,
    requirements_inserted: reqRows.length,
    source: "spojex_fallback",
  });
}
