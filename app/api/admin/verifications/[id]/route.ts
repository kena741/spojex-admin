import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission, requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";
import { fallbackRequirementsForRole } from "@/lib/verification-docs";

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

function pythonErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const p = payload as {
    detail?: { message?: string; code?: string } | string;
    message?: string;
    error?: string;
  };
  if (typeof p.detail === "string") return p.detail;
  if (p.detail && typeof p.detail === "object" && p.detail.message) return p.detail.message;
  return p.message || p.error || fallback;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermission(["users:read", "users:verify"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data, error } = await auth.context.client
    .from("identity_verification_requests")
    .select(
      "*, users!identity_verification_requests_user_id_fkey(id, display_name, full_name, email, role, avatar_url, verified), identity_verification_documents(*)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message, code: "api_failure" },
      { status: 400 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Request not found", code: "not_found" }, { status: 404 });
  }

  const docs = Array.isArray(data.identity_verification_documents)
    ? data.identity_verification_documents
    : [];
  const paths = docs
    .map((doc: { storage_path?: string }) =>
      typeof doc.storage_path === "string" ? doc.storage_path : "",
    )
    .filter(Boolean);

  const directUrl = (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return "";
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("/api/v1/media/")
    ) {
      return trimmed;
    }
    return "";
  };

  let signed: { path: string; signedUrl: string }[] = [];
  const legacyPaths = paths.filter((path: string) => !directUrl(path));
  if (legacyPaths.length > 0) {
    try {
      const { data: signedData } = await auth.context.client.storage
        .from("identity-docs")
        .createSignedUrls(legacyPaths, 15 * 60);
      signed = (signedData ?? [])
        .filter((item) => item.path && item.signedUrl)
        .map((item) => ({
          path: item.path as string,
          signedUrl: item.signedUrl as string,
        }));
    } catch {
      signed = [];
    }
  }

  const urlByPath = new Map(signed.map((item) => [item.path, item.signedUrl]));
  const documents = docs.map((doc: { storage_path?: string; kind?: string }) => {
    const path = doc.storage_path ?? "";
    return {
      ...doc,
      signed_url: directUrl(path) || urlByPath.get(path) || "",
      // No per-document status column yet - presence means submitted.
      review_state: "submitted" as const,
    };
  });

  const role =
    typeof data.users === "object" && data.users && !Array.isArray(data.users)
      ? String((data.users as { role?: string }).role ?? "")
      : "";
  let requirements = fallbackRequirementsForRole(role);
  let requirementsSource: "database" | "fallback" = "fallback";
  if (role) {
    const { data: reqRows, error: reqError } = await auth.context.client.rpc(
      "identity_verification_requirements",
      { p_role_slug: role },
    );
    if (!reqError && Array.isArray(reqRows) && reqRows.length > 0) {
      requirements = reqRows;
      requirementsSource = "database";
    } else if (!reqError && Array.isArray(reqRows) && reqRows.length === 0) {
      requirements = [];
      requirementsSource = "database";
    }
  }

  const uploadedKinds = new Set(documents.map((d: { kind?: string }) => d.kind).filter(Boolean));
  const missingRequired = requirements.filter(
    (item: { is_required?: boolean; slug?: string }) =>
      item.is_required && item.slug && !uploadedKinds.has(item.slug),
  );

  // Prior submissions for the same applicant (history, not document contents).
  let prior_submissions: Array<Record<string, unknown>> = [];
  if (data.user_id) {
    const { data: prior } = await auth.context.client
      .from("identity_verification_requests")
      .select("id, status, review_note, reviewed_at, created_at, updated_at, reviewer_id")
      .eq("user_id", data.user_id)
      .neq("id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    prior_submissions = prior ?? [];
  }

  const timeline = [
    {
      at: data.created_at,
      action: "submitted",
      label: "Request submitted",
    },
    data.reviewer_id
      ? {
          at: data.updated_at,
          action: "claimed_or_updated",
          label: "Reviewer assigned / updated",
          reviewer_id: data.reviewer_id,
        }
      : null,
    data.reviewed_at
      ? {
          at: data.reviewed_at,
          action: data.status,
          label: `Decision: ${data.status}`,
          note_present: Boolean(String(data.review_note || "").trim()),
        }
      : String(data.review_note || "").trim()
        ? {
            at: data.updated_at,
            action: "needs_info",
            label: "Applicant-facing feedback sent",
          }
        : null,
  ].filter(Boolean);

  return NextResponse.json({
    data: {
      ...data,
      identity_verification_documents: documents,
      role_requirements: requirements,
      requirements_source: requirementsSource,
      missing_required: missingRequired,
      verification_scope: "identity",
      prior_submissions,
      timeline,
      // notes = internal; review_note = applicant-facing
      internal_notes: data.notes ?? "",
      applicant_feedback: data.review_note ?? "",
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("users:verify");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    status?: string;
    review_note?: string;
    internal_note?: string;
    expected_updated_at?: string;
    action?: string;
  };

  if (body.action === "claim") {
    const proxied = await proxyPython(`/api/v1/admin/verifications/${id}/claim`, {
      method: "POST",
      body: JSON.stringify({ expected_updated_at: body.expected_updated_at || null }),
    });
    if (proxied?.res.ok) {
      return NextResponse.json({ data: proxied.payload, source: "python" });
    }
    if (proxied && proxied.res.status >= 400) {
      return NextResponse.json(
        {
          error: pythonErrorMessage(proxied.payload, "Claim failed"),
          code: "claim_failed",
        },
        { status: proxied.res.status },
      );
    }
    // Local fallback claim
    const reviewerId = auth.context.staff.user_id || auth.context.user.id;
    const { data, error } = await auth.context.client
      .from("identity_verification_requests")
      .update({
        reviewer_id: reviewerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .is("reviewer_id", null)
      .select("*")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Already claimed or not pending", code: "claimed" },
        { status: 409 },
      );
    }
    return NextResponse.json({ data, source: "spojex_fallback" });
  }

  const status = body.status?.trim();
  const note = body.review_note?.trim() ?? "";
  const internalNote = body.internal_note?.trim();

  const proxied = await proxyPython(`/api/v1/admin/verifications/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      review_note: note,
      internal_note: internalNote ?? null,
      expected_updated_at: body.expected_updated_at || null,
    }),
  });
  if (proxied?.res.ok) {
    return NextResponse.json({ data: proxied.payload, source: "python" });
  }
  if (proxied && proxied.res.status >= 400 && proxied.res.status !== 404) {
    return NextResponse.json(
      {
        error: pythonErrorMessage(proxied.payload, "Review failed"),
        code: "review_failed",
        detail: proxied.payload,
      },
      { status: proxied.res.status },
    );
  }

  // Fallback: existing Spojex RPC / direct update paths
  if (status === "pending") {
    if (!note) {
      return NextResponse.json(
        { error: "review_note is required when requesting more info" },
        { status: 400 },
      );
    }
    const reviewerId = auth.context.staff.user_id || auth.context.user.id;
    const patch: Record<string, unknown> = {
      review_note: note,
      reviewer_id: reviewerId,
      updated_at: new Date().toISOString(),
    };
    if (internalNote) patch.notes = internalNote;
    const { data, error } = await auth.context.client
      .from("identity_verification_requests")
      .update(patch)
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error) {
      const hint = missingServiceRoleMessage();
      return NextResponse.json(
        { error: hint ? `${error.message}. ${hint}` : error.message },
        { status: 400 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Pending request not found" }, { status: 404 });
    }
    return NextResponse.json({ data, source: "spojex_fallback" });
  }

  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json(
      { error: "status must be approved, rejected, or pending" },
      { status: 400 },
    );
  }
  if (status === "rejected" && !note) {
    return NextResponse.json({ error: "A reason is required to reject" }, { status: 400 });
  }

  if (internalNote) {
    await auth.context.client
      .from("identity_verification_requests")
      .update({ notes: internalNote })
      .eq("id", id);
  }

  const { data, error } = await auth.context.client.rpc("review_identity_verification", {
    p_request_id: id,
    p_status: status,
    p_note: note,
  });
  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data, source: "spojex_fallback" });
}
