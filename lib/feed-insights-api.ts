import { NextResponse } from "next/server";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export async function proxyFeedInsights(
  path: string,
  init?: RequestInit & { searchParams?: URLSearchParams },
): Promise<Response> {
  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const qs = init?.searchParams?.toString();
  const url = `${getSpojexApiBaseUrl()}/api/v1/admin/feed-insights${path}${qs ? `?${qs}` : ""}`;
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
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      {
        error:
          (payload as { error?: string; message?: string }).error ||
          (payload as { message?: string }).message ||
          "Request failed",
        code: (payload as { code?: string }).code,
      },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
