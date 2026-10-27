import { NextResponse } from "next/server";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

/** Proxy to the backend Profile Configuration API (it enforces profile_catalog:* and audits). */
export async function proxyProfileCatalog(
  path: string,
  init?: RequestInit & { searchParams?: URLSearchParams },
): Promise<Response> {
  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const qs = init?.searchParams?.toString();
  const url = `${getSpojexApiBaseUrl()}/api/v1/admin/profile-catalog${path}${qs ? `?${qs}` : ""}`;
  const { searchParams: _sp, ...rest } = init || {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers || {}),
    },
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Keep structured details (validation errors, conflicts) for the editor.
    return NextResponse.json(
      {
        error: (payload.message as string) || (payload.error as string) || "Request failed",
        code: payload.code,
        detail: payload.detail,
      },
      { status: res.status },
    );
  }
  return NextResponse.json({ data: payload });
}
