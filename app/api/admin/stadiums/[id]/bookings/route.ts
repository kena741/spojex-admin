import { NextResponse } from "next/server";
import type { SpojexClient } from "@/lib/api/client";
import { requireAnyAdminPermission } from "@/lib/admin-auth";
import { getSpojexApiBaseUrl } from "@/lib/env";
import { requestAccessToken } from "@/lib/spojex/server";

export const dynamic = "force-dynamic";

function startOfTodayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function localBookings(client: SpojexClient, stadiumId: string) {
  const today = startOfTodayIsoDate();
  const [bookingsRes, paymentsRes] = await Promise.all([
    client
      .from("stadium_bookings")
      .select("*, users:user_id(id, display_name, email, phone, role)")
      .eq("stadium_id", stadiumId)
      .order("booking_date", { ascending: false })
      .limit(100),
    client
      .from("stadium_payments")
      .select("id, booking_id, status, amount, currency, paid_at, created_at")
      .eq("stadium_id", stadiumId)
      .not("booking_id", "is", null)
      .limit(2000),
  ]);

  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  type Pay = {
    id: string;
    booking_id: string | null;
    status: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    created_at: string;
  };
  const payments = (paymentsRes.data ?? []) as Pay[];
  const payByBooking = new Map<string, Pay>();
  for (const p of payments) {
    if (!p.booking_id) continue;
    const prev = payByBooking.get(p.booking_id);
    if (!prev || (p.created_at || "") > (prev.created_at || "")) {
      payByBooking.set(p.booking_id, p);
    }
  }

  type BookingRow = {
    id: string;
    booking_date: string;
    status: string;
    [key: string]: unknown;
  };
  const rows = ((bookingsRes.data ?? []) as BookingRow[]).map((row) => {
    const pay = payByBooking.get(String(row.id));
    const status = String(row.status || "").toLowerCase();
    const transitions: Record<string, string[]> = {
      pending: ["confirmed", "completed", "cancelled"],
      confirmed: ["checked_in", "completed", "cancelled"],
      checked_in: ["completed", "cancelled"],
      active: ["completed", "cancelled"],
    };
    return {
      ...row,
      payment: pay
        ? {
            id: pay.id,
            status: pay.status,
            amount: Number(pay.amount) || 0,
            currency: pay.currency,
            paid_at: pay.paid_at,
          }
        : null,
      allowed_transitions: transitions[status] ?? [],
    };
  });

  const paidOk = (s: string) =>
    ["completed", "paid", "success", "verified"].includes(s.toLowerCase());
  const bookingPays = payments.filter((p) => paidOk(p.status));
  const earnedToday = bookingPays
    .filter((p) => (p.paid_at || p.created_at || "").slice(0, 10) === today)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalEarned = bookingPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return {
    data: rows,
    analytics: {
      today: rows.filter((r) => String(r.booking_date).slice(0, 10) === today).length,
      pending: rows.filter((r) => String(r.status).toLowerCase() === "pending").length,
      upcoming: rows.filter((r) =>
        ["confirmed", "checked_in", "active"].includes(String(r.status).toLowerCase()),
      ).length,
      completed: rows.filter((r) => String(r.status).toLowerCase() === "completed").length,
      cancelled: rows.filter((r) =>
        ["cancelled", "canceled", "declined"].includes(String(r.status).toLowerCase()),
      ).length,
      total: rows.length,
      total_earned: totalEarned,
      earned_today: earnedToday,
      currency: bookingPays[0]?.currency || "ETB",
    },
    source: "local",
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyAdminPermission(["stadiums:read", "stadiums:write"]);
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const token = await requestAccessToken();
  if (token) {
    try {
      const res = await fetch(
        `${getSpojexApiBaseUrl()}/api/v1/admin/stadiums/${id}/bookings`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ...payload, source: "python" });
      if (res.status !== 404) {
        return NextResponse.json(
          {
            error:
              (payload as { detail?: { message?: string } }).detail?.message ||
              (payload as { error?: string }).error ||
              "Failed to load bookings",
          },
          { status: res.status },
        );
      }
    } catch {
      // local fallback
    }
  }

  try {
    return NextResponse.json(await localBookings(auth.context.client, id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load bookings" },
      { status: 500 },
    );
  }
}
