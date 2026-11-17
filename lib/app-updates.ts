import { NextResponse } from "next/server";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export type AppPlatform = "android" | "ios";
export const APP_PLATFORMS: AppPlatform[] = ["android", "ios"];

export type AppUpdateSettings = {
  platform: AppPlatform;
  store: {
    version: string;
    url: string;
    release_notes: string;
    released_at: string | null;
    checked_at: string | null;
    error: string;
    country: string;
  };
  target_version: string;
  target_build: number | null;
  update_type: "optional" | "mandatory";
  title: string;
  description: string;
  notify_enabled: boolean;
  notify_frequency_hours: number;
  staged_rollout: boolean;
  /** Whether the store already shows target_version. */
  store_live: "live" | "not_live" | "unknown";
  updated_at: string | null;
  updated_by: string | null;
};

export function isAppPlatform(value: string): value is AppPlatform {
  return value === "android" || value === "ios";
}

function errorMessage(payload: Record<string, unknown>, fallback: string) {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const message = (detail as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  return fallback;
}

/** Server-side: forward to /api/v1/admin/app-updates… on Spojex REST. */
export async function proxyAppUpdates(
  path: string,
  method: "GET" | "PATCH" | "POST",
  body?: unknown,
) {
  const token = await requestAccessToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await fetch(`${getSpojexApiBaseUrl()}/api/v1/admin/app-updates${path}`, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: errorMessage(payload, "App update request failed") },
      { status: res.status },
    );
  }
  return NextResponse.json({ data: payload });
}

export const UPDATE_FREQUENCIES: { hours: number; label: string }[] = [
  { hours: 0, label: "Every app launch" },
  { hours: 6, label: "Every 6 hours" },
  { hours: 12, label: "Every 12 hours" },
  { hours: 24, label: "Once a day" },
  { hours: 72, label: "Every 3 days" },
  { hours: 168, label: "Once a week" },
];

/** Same rules as the backend/app: numeric semver, pre-release < release, then build. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const m = /^\s*v?(\d+(?:\.\d+){0,3})(?:-([0-9A-Za-z.-]+))?(?:\+(\d+))?\s*$/.exec(v || "");
    if (!m) return null;
    return { nums: m[1].split(".").map(Number), pre: m[2] ?? "", build: m[3] ? Number(m[3]) : null };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return Number(!!pa) - Number(!!pb);
  const width = Math.max(pa.nums.length, pb.nums.length, 3);
  for (let i = 0; i < width; i += 1) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (pa.pre !== pb.pre) {
    if (!pa.pre) return 1;
    if (!pb.pre) return -1;
    return pa.pre < pb.pre ? -1 : 1;
  }
  if (pa.build != null && pb.build != null && pa.build !== pb.build) {
    return pa.build < pb.build ? -1 : 1;
  }
  return 0;
}
