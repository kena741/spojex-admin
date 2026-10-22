import { NextResponse } from "next/server";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export async function proxyAdminMessages(
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
  const url = `${getSpojexApiBaseUrl()}/api/v1/admin/messages${path}${qs ? `?${qs}` : ""}`;
  const { searchParams: _sp, ...rest } = init || {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(rest.headers || {}),
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't load messages.", code: "network_error" },
      { status: 502 },
    );
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      {
        error:
          (payload as { error?: string; message?: string }).error ||
          (payload as { message?: string }).message ||
          (res.status === 401
            ? "Your session has expired. Sign in again."
            : res.status === 403
              ? "You don’t have permission to view messages."
              : "Couldn't load messages."),
        code: (payload as { code?: string }).code,
      },
      { status: res.status },
    );
  }
  return NextResponse.json(payload);
}
