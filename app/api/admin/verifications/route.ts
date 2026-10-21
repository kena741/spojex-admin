import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

async function proxyPython(path: string) {
  const token = await requestAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${getSpojexApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({}));
    return { res, payload };
  } catch {
    return null;
  }
}

function facetForRow(row: {
  status?: string;
  reviewer_id?: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
}) {
  const status = String(row.status || "").toLowerCase();
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  const note = String(row.review_note || "").trim();
  if (note && !row.reviewed_at) return "needs_info";
  if (row.reviewer_id) return "in_review";
  return "pending";
}

/** Queue list — prefer Python admin (service DB), fall back to Spojex service role. */
export async function GET(request: Request) {
  const auth = await requireAnyAdminPermission(["users:read", "users:verify"]);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const proxied = await proxyPython(`/api/v1/admin/verifications?${url.searchParams}`);
  if (proxied?.res.ok) {
    return NextResponse.json({ ...proxied.payload, source: "python" });
  }

  const status = (url.searchParams.get("status") || "pending").toLowerCase();
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const role = (url.searchParams.get("role") || "all").toLowerCase();
  const reviewerId = (url.searchParams.get("reviewer_id") || "").trim();
  const submittedFrom = url.searchParams.get("submitted_from") || "";
  const submittedTo = url.searchParams.get("submitted_to") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") || 40) || 40));

  const { data, error } = await auth.context.client
    .from("identity_verification_requests")
    .select(
      "*, users!identity_verification_requests_user_id_fkey(id, display_name, full_name, email, role, avatar_url, verified)",
    )
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        code: "api_failure",
        source: "spojex_fallback",
        python_error:
          proxied && !proxied.res.ok
            ? (proxied.payload as { detail?: unknown; error?: string })?.error ||
              proxied.res.statusText
            : proxied
              ? null
              : "python_unreachable",
      },
      { status: 400 },
    );
  }

  const all = (data ?? []) as Array<Record<string, unknown>>;

  const counts = {
    pending: 0,
    pending_all: 0,
    in_review: 0,
    needs_info: 0,
    approved: 0,
    rejected: 0,
    total: all.length,
    oldest_pending_at: null as string | null,
  };
  let oldest: number | null = null;
  for (const row of all) {
    const facet = facetForRow(row as Parameters<typeof facetForRow>[0]);
    const st = String(row.status || "").toLowerCase();
    if (st === "pending") counts.pending_all += 1;
    if (facet === "pending") counts.pending += 1;
    else if (facet === "in_review") counts.in_review += 1;
    else if (facet === "needs_info") counts.needs_info += 1;
    else if (facet === "approved") counts.approved += 1;
    else if (facet === "rejected") counts.rejected += 1;
    if (st === "pending" && typeof row.created_at === "string") {
      const t = new Date(row.created_at).getTime();
      if (!Number.isNaN(t) && (oldest == null || t < oldest)) {
        oldest = t;
        counts.oldest_pending_at = row.created_at;
      }
    }
  }

  let filtered = all.filter((row) => {
    const facet = facetForRow(row as Parameters<typeof facetForRow>[0]);
    if (status !== "all" && facet !== status) return false;
    if (role !== "all") {
      const user = row.users as { role?: string } | null;
      if (String(user?.role || "").toLowerCase() !== role) return false;
    }
    if (reviewerId && String(row.reviewer_id || "") !== reviewerId) return false;
    if (submittedFrom) {
      const t = new Date(String(row.created_at || "")).getTime();
      const from = new Date(submittedFrom).getTime();
      if (!Number.isNaN(t) && !Number.isNaN(from) && t < from) return false;
    }
    if (submittedTo) {
      const t = new Date(String(row.created_at || "")).getTime();
      const to = new Date(submittedTo).getTime() + 864e5;
      if (!Number.isNaN(t) && !Number.isNaN(to) && t >= to) return false;
    }
    if (q) {
      const user = row.users as {
        display_name?: string;
        full_name?: string;
        email?: string;
        role?: string;
      } | null;
      const hay = [
        user?.display_name,
        user?.full_name,
        user?.email,
        user?.role,
        row.id,
        row.user_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  filtered = filtered.slice(start, start + pageSize).map((row) => ({
    ...row,
    verification_scope: "identity",
    queue_facet: facetForRow(row as Parameters<typeof facetForRow>[0]),
    missing_docs: false,
    missing_required_count: 0,
    document_count: 0,
    reviewer: row.reviewer_id
      ? { id: row.reviewer_id, display_name: null }
      : null,
  }));

  return NextResponse.json({
    data: filtered,
    total,
    page,
    page_size: pageSize,
    counts,
    counts_scope: "global",
    source: "spojex_fallback",
    python_fallback: true,
    definitions: {
      pending: "Pending with no reviewer claimed and no applicant-facing review note.",
      in_review: "Pending with a reviewer claimed and no applicant-facing note yet.",
      needs_info: "Pending with an applicant-facing review note awaiting resubmission.",
      scope: "Identity + role-document verification only. Org/gym verification are separate.",
    },
  });
}
