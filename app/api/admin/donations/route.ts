import { NextResponse } from "next/server";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import { requireAdminPermission } from "@/lib/admin-auth";
import {
  campaignDisplayGoal,
  campaignDisplayRaised,
  campaignIsCoin,
  campaignProgressBarPercent,
  campaignProgressLabel,
  campaignProgressPercent,
  slugifyDonation,
} from "@/lib/donations";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { resolvePlatformBeneficiaryUserId } from "@/lib/platform-beneficiary";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

function apiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as { message?: unknown; detail?: unknown; error?: unknown };
  for (const value of [body.message, body.detail, body.error]) {
    if (typeof value === "string" && value.trim() && !/^[a-z_]+$/.test(value)) {
      return value.trim();
    }
  }
  if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  return fallback;
}

export async function GET(request: Request) {
  const auth = await requireAdminPermission("donations:read");
  if (!auth.ok) return auth.error;

  const incoming = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "status",
    "asset",
    "featured",
    "beneficiary",
    "page",
    "page_size",
    "sort",
    "order",
  ]) {
    const value = incoming.searchParams.get(key);
    if (value) params.set(key, value);
  }

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/donations?${params}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      console.warn("[donations directory] python failed", res.status, apiErrorMessage(payload, ""));
    } catch (err) {
      console.warn("[donations directory] python unreachable", err);
    }
  }

  // Local fallback
  try {
    const page = Math.max(1, Number(params.get("page") || 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("page_size") || 40) || 40));
    const q = (params.get("q") || "").trim().toLowerCase();
    const status = (params.get("status") || "all").toLowerCase();
    const asset = (params.get("asset") || "all").toLowerCase();
    const featured = (params.get("featured") || "all").toLowerCase();
    const beneficiary = (params.get("beneficiary") || "").trim();

    const { data, error } = await auth.context.client
      .from("donation_campaigns")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    let rows = (data ?? []) as Record<string, unknown>[];
    rows = rows.filter((row) => {
      if (status !== "all" && String(row.status || "").toLowerCase() !== status) return false;
      if (featured === "yes" || featured === "featured") {
        if (!row.is_featured) return false;
      } else if (featured === "no") {
        if (row.is_featured) return false;
      }
      if (beneficiary && String(row.beneficiary_user_id || "") !== beneficiary) return false;
      const coin = campaignIsCoin(row as never);
      if (asset === "coin" || asset === "coins") {
        if (!coin) return false;
      } else if (asset === "etb" || asset === "money") {
        if (coin) return false;
      }
      if (q) {
        const hay = [row.title, row.slug, row.summary]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize).map((row) => {
      const coin = campaignIsCoin(row as never);
      const cover = String(row.cover_url || row.image_url || "");
      return {
        ...row,
        asset: coin ? "coin" : "etb",
        asset_label: coin ? "Coins" : "ETB",
        raised_display: campaignDisplayRaised(row as never),
        goal_display: campaignDisplayGoal(row as never),
        progress_percent: campaignProgressPercent(row as never),
        progress_bar_percent: campaignProgressBarPercent(row as never),
        progress_label: campaignProgressLabel(row as never),
        media: {
          display_url: cover,
          cover_url: row.cover_url,
          thumbnail_url: row.image_url,
          using_thumbnail_as_cover: !row.cover_url && !!row.image_url,
        },
        href: `/admin/donations/${row.id}`,
      };
    });

    let etbRaised = 0;
    let coinRaised = 0;
    for (const row of rows) {
      if (campaignIsCoin(row as never)) coinRaised += Number(row.raised_coins || 0);
      else etbRaised += Number(row.raised_amount || 0);
    }

    return NextResponse.json({
      data: pageRows,
      total,
      page,
      page_size: pageSize,
      totals: {
        etb_raised: etbRaised,
        coin_raised: coinRaised,
        note: "ETB and coin totals are separate; coins have no implied cash value.",
      },
      disbursements_supported: false,
      source: "local",
    });
  } catch (err) {
    const hint = missingServiceRoleMessage();
    const message = err instanceof Error ? err.message : "Failed to load campaigns";
    return NextResponse.json(
      { error: hint ? `${message}. ${hint}` : message },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("donations:write");
  if (!auth.ok) return auth.error;
  const body = (await request.json()) as Record<string, unknown>;
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  let beneficiary =
    typeof body.beneficiary_user_id === "string" ? body.beneficiary_user_id.trim() : "";
  if (!beneficiary) {
    beneficiary = (await resolvePlatformBeneficiaryUserId(auth.context.client)) || "";
  }

  const currency = String(body.currency || "COIN").toUpperCase();
  const isCoin = currency === "COIN" || currency === "COINS";
  const goal = Number(body.goal_coins ?? body.goal_amount ?? 0) || 0;

  const { data, error } = await auth.context.client
    .from("donation_campaigns")
    .insert({
      title,
      slug: String(body.slug || slugifyDonation(title) || "campaign"),
      summary: String(body.summary ?? ""),
      description: String(body.description ?? ""),
      image_url: String(body.image_url ?? ""),
      cover_url: String(body.cover_url ?? ""),
      goal_amount: isCoin ? goal : goal,
      raised_amount: 0,
      goal_coins: isCoin ? goal : 0,
      raised_coins: 0,
      currency: isCoin ? "COIN" : "ETB",
      status: String(body.status || "draft"),
      is_featured: body.is_featured === true,
      sort_order: Number(body.sort_order) || 0,
      beneficiary_user_id: beneficiary || null,
    })
    .select()
    .single();

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
