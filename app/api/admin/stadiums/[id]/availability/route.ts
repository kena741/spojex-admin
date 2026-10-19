import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-auth";
import { missingServiceRoleMessage } from "@/lib/api-auth";
import {
  emptyStadiumWeekHours,
  overlappingStadiumSlotsError,
  stadiumWeekDays,
  timeInputValue,
  type StadiumTimeSlot,
} from "@/lib/stadiums";

function dateOnly(value: unknown) {
  return `${value ?? ""}`.slice(0, 10);
}

function slotFrom(start?: string | null, end?: string | null): StadiumTimeSlot {
  return {
    start_time: timeInputValue(start),
    end_time: timeInputValue(end),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:read");
  if (!auth.ok) return auth.error;
  const { id } = await params;

  const { data, error } = await auth.context.client
    .from("stadium_availability")
    .select("id, day_of_week, specific_date, start_time, end_time, is_blocked, notes")
    .eq("stadium_id", id)
    .order("start_time");

  if (error) {
    const hint = missingServiceRoleMessage();
    return NextResponse.json(
      { error: hint ? `${error.message}. ${hint}` : error.message },
      { status: 400 },
    );
  }

  const weekly = emptyStadiumWeekHours();
  for (const day of weekly) {
    const rows = (data ?? []).filter(
      (row: any) => !row.specific_date && row.day_of_week === day.day_of_week,
    );
    if (!rows.length) continue;
    const open = rows.filter((row: any) => row.is_blocked !== true);
    if (open.length === 0) {
      day.closed = true;
      day.slots = [];
      continue;
    }
    day.closed = false;
    day.slots = open.map((row: any) => slotFrom(row.start_time, row.end_time));
  }

  const today = new Date().toISOString().slice(0, 10);
  const blocks = (data ?? [])
    .filter((row: any) => row.is_blocked && row.specific_date)
    .map((row: any) => ({
      id: row.id as string,
      specific_date: dateOnly(row.specific_date),
      start_time: timeInputValue(row.start_time),
      end_time: timeInputValue(row.end_time),
      notes: `${row.notes ?? ""}`.trim(),
    }))
    .filter((row: any) => row.specific_date >= today)
    .sort((a: any, b: any) => `${a.specific_date}${a.start_time}`.localeCompare(`${b.specific_date}${b.start_time}`));

  return NextResponse.json({ weekly, blocks, days: stadiumWeekDays });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    weekly?: {
      day_of_week?: number;
      closed?: boolean;
      start_time?: string;
      end_time?: string;
      slots?: StadiumTimeSlot[];
    }[];
  };
  const weekly = body.weekly ?? [];
  if (weekly.length === 0) {
    return NextResponse.json({ error: "Weekly hours are required" }, { status: 400 });
  }

  const rows: {
    stadium_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_blocked: boolean;
    notes: string;
  }[] = [];

  for (const day of stadiumWeekDays) {
    const match = weekly.find((item) => item.day_of_week === day.day);
    const slots = (match?.slots?.length
      ? match.slots
      : match?.start_time && match?.end_time
        ? [slotFrom(match.start_time, match.end_time)]
        : []
    ).map((slot) => slotFrom(slot.start_time, slot.end_time));
    const closed = match?.closed === true || slots.length === 0;
    if (closed) {
      rows.push({
        stadium_id: id,
        day_of_week: day.day,
        start_time: "06:00",
        end_time: "22:00",
        is_blocked: true,
        notes: "Closed",
      });
      continue;
    }

    const overlap = overlappingStadiumSlotsError(slots);
    if (overlap) {
      return NextResponse.json({ error: `${day.label}: ${overlap}` }, { status: 400 });
    }
    for (const slot of slots) {
      rows.push({
        stadium_id: id,
        day_of_week: day.day,
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_blocked: false,
        notes: "Weekly hours",
      });
    }
  }

  const { error: deleteError } = await auth.context.client
    .from("stadium_availability")
    .delete()
    .eq("stadium_id", id)
    .is("specific_date", null);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const { error: insertError } = await auth.context.client.from("stadium_availability").insert(rows);
  if (insertError) {
    const hint = insertError.message.includes("stadium_availability_weekly_uniq")
      ? " Run migrations/040_stadium_multi_slots.sql so a day can have more than one slot."
      : "";
    return NextResponse.json({ error: `${insertError.message}${hint}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const body = (await request.json()) as {
    date?: string;
    end_date?: string;
    start_time?: string;
    end_time?: string;
    notes?: string;
    recurrence?: string;
    weekdays?: number[];
    /** When true, block the whole calendar day (00:00–23:59). */
    whole_day?: boolean;
  };
  const startDate = dateOnly(body.date);
  const endDate = dateOnly(body.end_date || body.date);
  const wholeDay = body.whole_day === true;
  const start = wholeDay ? "00:00" : timeInputValue(body.start_time);
  const end = wholeDay ? "23:59" : timeInputValue(body.end_time);
  const notes = `${body.notes ?? ""}`.trim() || "Blocked";
  const recurrence = `${body.recurrence ?? ""}`.trim().toLowerCase();
  const weekdays = Array.isArray(body.weekdays)
    ? body.weekdays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "Pick a start date" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: "Pick an end date" }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
  }
  if (start >= end) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  const daySpan = Math.round((endMs - startMs) / 86_400_000);
  if (daySpan > 366) {
    return NextResponse.json({ error: "Date range is too long (max 1 year)" }, { status: 400 });
  }

  /** Spojex day_of_week: 0=Sun … 6=Sat (JS getUTCDay matches). */
  const rows: {
    stadium_id: string;
    specific_date: string;
    start_time: string;
    end_time: string;
    is_blocked: boolean;
    notes: string;
  }[] = [];

  for (let i = 0; i <= daySpan; i++) {
    const day = new Date(startMs + i * 86_400_000);
    const iso = day.toISOString().slice(0, 10);
    const dow = day.getUTCDay();
    if (recurrence === "weekly" && weekdays.length > 0 && !weekdays.includes(dow)) {
      continue;
    }
    rows.push({
      stadium_id: id,
      specific_date: iso,
      start_time: start,
      end_time: end,
      is_blocked: true,
      notes,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No days matched. Check recurrence weekdays." },
      { status: 400 },
    );
  }

  const { error } = await auth.context.client.from("stadium_availability").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, created: rows.length });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission("stadiums:write");
  if (!auth.ok) return auth.error;
  const { id } = await params;
  const blockId = new URL(request.url).searchParams.get("blockId")?.trim() ?? "";
  if (!blockId) return NextResponse.json({ error: "Missing block" }, { status: 400 });

  const { error } = await auth.context.client
    .from("stadium_availability")
    .delete()
    .eq("id", blockId)
    .eq("stadium_id", id)
    .eq("is_blocked", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
