import { NextResponse } from "next/server";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export async function proxyAdminReports(
  path: string,
  init?: RequestInit & { searchParams?: URLSearchParams },
): Promise<Response> {
  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: "Your session has expired. Sign in again.", code: "unauthorized" },
      { status: 401 },
    );
  }
  const qs = init?.searchParams?.toString();
  const url = `${getSpojexApiBaseUrl()}/api/v1/admin/reports${path}${qs ? `?${qs}` : ""}`;
  const { searchParams: _sp, ...rest } = init || {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers || {}),
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't load reports.", code: "network_error" },
      { status: 502 },
    );
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (payload as { error?: string; message?: string; detail?: { message?: string } }).error ||
      (payload as { message?: string }).message ||
      (payload as { detail?: { message?: string } }).detail?.message ||
      (res.status === 401
        ? "Your session has expired. Sign in again."
        : res.status === 403
          ? "You don’t have permission to view reports."
          : "Couldn't load reports.");
    return NextResponse.json(
      {
        error: message,
        code:
          (payload as { code?: string }).code ||
          (res.status === 401
            ? "unauthorized"
            : res.status === 403
              ? "forbidden"
              : "upstream_error"),
      },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
