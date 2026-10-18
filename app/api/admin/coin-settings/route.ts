import { NextResponse } from "next/server";
import { requireAdminPermission, requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

function backendError(payload: Record<string, unknown>, fallback: string) {
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const nested = detail as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message;
    }
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
}

async function proxySettings(method: "GET" | "PATCH", body?: unknown) {
  const token = await requestAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const base = getSpojexApiBaseUrl();
  const res = await fetch(`${base}/api/v1/admin/coins/settings`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: backendError(payload, "Could not update coin settings") },
      { status: res.status },
    );
  }
  const etb = Number(payload.etb_per_coin ?? 0);
  return NextResponse.json({
    ...payload,
    data: {
      ...payload,
      coins_per_birr: etb > 0 ? 1 / etb : null,
    },
  });
}

/** Read rate + redemption limits from Spojex REST. */
export async function GET() {
  const auth = await requireAnyAdminPermission([
    "donations:read",
    "donations:write",
  ]);
  if (!auth.ok) return auth.error;
  return proxySettings("GET");
}

/**
 * Persist buy/credit rate and/or redemption limits.
 * Prefer coins_per_birr (1 Birr = N coins).
 */
export async function POST(request: Request) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;

  const body = (await request.json()) as {
    etb_per_coin?: number;
    coins_per_birr?: number;
    min_redemption_coins?: number;
    max_redemption_coins?: number;
    max_pending_redemptions?: number;
  };

  const patch: Record<string, number> = {};

  const coinsPerBirr = Number(body.coins_per_birr);
  if (Number.isFinite(coinsPerBirr) && coinsPerBirr > 0) {
    patch.coins_per_birr = coinsPerBirr;
  } else {
    const etbPerCoin = Number(body.etb_per_coin);
    if (Number.isFinite(etbPerCoin) && etbPerCoin > 0) {
      patch.etb_per_coin = etbPerCoin;
    }
  }

  if (body.min_redemption_coins != null) {
    const n = Number(body.min_redemption_coins);
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json(
        { error: "min_redemption_coins must be at least 1" },
        { status: 400 },
      );
    }
    patch.min_redemption_coins = Math.floor(n);
  }
  if (body.max_redemption_coins != null) {
    const n = Number(body.max_redemption_coins);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "max_redemption_coins must be >= 0 (0 = unlimited)" },
        { status: 400 },
      );
    }
    patch.max_redemption_coins = Math.floor(n);
  }
  if (body.max_pending_redemptions != null) {
    const n = Number(body.max_pending_redemptions);
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json(
        { error: "max_pending_redemptions must be at least 1" },
        { status: 400 },
      );
    }
    patch.max_pending_redemptions = Math.floor(n);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      {
        error:
          "Provide coins_per_birr / etb_per_coin and/or redemption limit fields.",
      },
      { status: 400 },
    );
  }

  return proxySettings("PATCH", patch);
}
