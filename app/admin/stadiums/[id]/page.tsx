"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/components/admin-header";
import { AdminCode, normalizeAdminCode } from "@/components/admin-code";
import { AdminEmpty, AdminErrorAlert, AdminLoadingRow, AdminModal, AdminTableShell } from "@/components/admin-layout";
import { StadiumEditModal } from "@/components/stadium-edit-modal";
import { StatusBadge, requestTone } from "@/components/status-badge";
import { VisiblePassword } from "@/components/visible-password";
import { formatStadiumArea } from "@/lib/addis-ababa-locations";
import { deleteAdmin, patchAdmin, postAdmin, postAdminResponse } from "@/lib/hooks";
import {
  formatPrice,
  generateStadiumManagerPassword,
  parseStadiumPricing,
  planTypeLabel,
  sizeTypeLabel,
  stadiumCoverUrl,
  stadiumPhotoUrls,
  stadiumPlanTypes,
  stadiumPricingPayload,
  stadiumRevenueFromPayments,
  stadiumStatusLabel,
  stadiumWeekDays,
  emptyStadiumWeekHours,
  normalizeStadiumWeekHours,
  overlappingStadiumSlotsError,
  stadiumSlotsOverlap,
  timeInputValue,
  type StadiumAvailabilityBlock,
  type StadiumPricing,
  type StadiumTimeSlot,
  type StadiumWeekHour,
} from "@/lib/stadiums";
import { getSpojexClient } from "@/lib/spojex/client";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import type {
  StadiumBookingRow,
  StadiumManagerRow,
  StadiumPaymentRow,
  StadiumRow,
  StadiumSubscriptionRow,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "hours", label: "Hours" },
  { id: "pricing", label: "Pricing" },
  { id: "booking", label: "Booking" },
  { id: "managers", label: "Managers" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function StadiumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, staff } = useAdminPermissions();
  const canWrite = can("stadiums:write");
  const [tab, setTab] = useState<TabId>("overview");
  const [stadium, setStadium] = useState<StadiumRow | null>(null);
  const [pricing, setPricing] = useState<StadiumPricing>({
    currency: "ETB",
    hourly: null,
    daily: null,
    monthly: null,
    yearly: null,
  });
  const [bookings, setBookings] = useState<StadiumBookingRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<StadiumSubscriptionRow[]>([]);
  const [payments, setPayments] = useState<StadiumPaymentRow[]>([]);
  const [revenuePayments, setRevenuePayments] = useState<
    Pick<StadiumPaymentRow, "amount" | "currency" | "status" | "paid_at" | "created_at">[]
  >([]);
  const [managers, setManagers] = useState<StadiumManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passQuery, setPassQuery] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [managerForm, setManagerForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: generateStadiumManagerPassword(),
    manager_role: "manager",
  });
  const [savingManager, setSavingManager] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [createdLogin, setCreatedLogin] = useState<{ email: string; password: string } | null>(null);
  const [weekHours, setWeekHours] = useState<StadiumWeekHour[]>(emptyStadiumWeekHours());
  const [selectedWeekDay, setSelectedWeekDay] = useState(1);
  const [slotDraft, setSlotDraft] = useState<StadiumTimeSlot>({ start_time: "09:00", end_time: "11:00" });
  const [blocks, setBlocks] = useState<StadiumAvailabilityBlock[]>([]);
  const [savingHours, setSavingHours] = useState(false);
  const [savingBlock, setSavingBlock] = useState(false);
  const [blockForm, setBlockForm] = useState({
    date: "",
    end_date: "",
    start_time: "09:00",
    end_time: "11:00",
    notes: "Emergency",
    whole_day: false,
    recurrence: "" as "" | "weekly",
    weekdays: [] as number[],
  });

  const load = async () => {
    const spojex = getSpojexClient();
    const [stadiumRes, bookingsRes, subsRes, paymentsRes, revenueRes, managersRes, hoursRes] = await Promise.all([
      spojex
        .from("stadiums")
        .select("*, users:owner_user_id(id, display_name, email)")
        .eq("id", id)
        .maybeSingle(),
      spojex
        .from("stadium_bookings")
        .select("*, users:user_id(id, display_name)")
        .eq("stadium_id", id)
        .order("booking_date", { ascending: false })
        .limit(50),
      spojex
        .from("stadium_subscriptions")
        .select("*, users:user_id(id, display_name)")
        .eq("stadium_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      spojex
        .from("stadium_payments")
        .select("*, users:user_id(id, display_name)")
        .eq("stadium_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      spojex
        .from("stadium_payments")
        .select("amount, currency, status, paid_at, created_at")
        .eq("stadium_id", id)
        .eq("status", "completed")
        .limit(2000),
      fetch(`/api/admin/stadiums/${id}/managers`, { credentials: "same-origin" }),
      fetch(`/api/admin/stadiums/${id}/availability`, { credentials: "same-origin" }),
    ]);
    if (stadiumRes.error) throw stadiumRes.error;
    setStadium(stadiumRes.data as StadiumRow | null);
    setPricing(parseStadiumPricing((stadiumRes.data as StadiumRow | null)?.pricing));
    setBookings((bookingsRes.data ?? []) as StadiumBookingRow[]);
    setSubscriptions((subsRes.data ?? []) as StadiumSubscriptionRow[]);
    setPayments((paymentsRes.data ?? []) as StadiumPaymentRow[]);
    setRevenuePayments(
      (revenueRes.data ?? paymentsRes.data ?? []) as Pick<
        StadiumPaymentRow,
        "amount" | "currency" | "status" | "paid_at" | "created_at"
      >[],
    );
    const managersPayload = (await managersRes.json()) as { data?: StadiumManagerRow[]; error?: string };
    if (managersRes.ok) {
      setManagers(managersPayload.data ?? []);
    } else {
      setManagers([]);
      if (managersPayload.error) {
        setError(
          managersPayload.error.includes("login_password")
            ? "Run migrations/033_stadium_manager_login_password.sql so manager passwords can be stored and shown."
            : managersPayload.error,
        );
      }
    }
    const hoursPayload = (await hoursRes.json()) as {
      weekly?: StadiumWeekHour[];
      blocks?: StadiumAvailabilityBlock[];
      error?: string;
    };
    if (hoursRes.ok) {
      setWeekHours(normalizeStadiumWeekHours(hoursPayload.weekly));
      setBlocks(hoursPayload.blocks ?? []);
    } else if (hoursPayload.error) {
      setWeekHours(emptyStadiumWeekHours());
      setBlocks([]);
      setError(
        hoursPayload.error.includes("weekly_uniq")
          ? `${hoursPayload.error} Run migrations/040_stadium_multi_slots.sql so a day can have more than one slot.`
          : hoursPayload.error.includes("permission") || hoursPayload.error.includes("policy")
            ? `${hoursPayload.error} Run migrations/037_stadium_admin_hours.sql.`
            : hoursPayload.error,
      );
    }
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveStadium = async (patch: Record<string, unknown>) => {
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(`/api/admin/stadiums/${id}`, patch);
      await load();
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const savePricing = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setSavingPlan(true);
    setError(null);
    try {
      await patchAdmin(`/api/admin/stadiums/${id}`, {
        pricing: stadiumPricingPayload(pricing),
      });
      await load();
      setNotice("Pricing saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save pricing failed");
    } finally {
      setSavingPlan(false);
    }
  };

  const saveHours = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setSavingHours(true);
    setError(null);
    try {
      await fetch(`/api/admin/stadiums/${id}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ weekly: weekHours }),
      }).then(async (response) => {
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Save hours failed");
      });
      await load();
      setNotice("Hours saved. Fans will see these visiting times.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save hours failed");
    } finally {
      setSavingHours(false);
    }
  };

  const selectedHours =
    weekHours.find((item) => item.day_of_week === selectedWeekDay) ?? {
      day_of_week: selectedWeekDay,
      closed: false,
      slots: [{ start_time: "06:00", end_time: "22:00" }],
    };

  const patchSelectedDay = (patch: Partial<StadiumWeekHour>) => {
    setWeekHours((current) =>
      current.map((item) =>
        item.day_of_week === selectedWeekDay ? { ...item, ...patch } : item,
      ),
    );
  };

  const addSlotToSelectedDay = () => {
    const next = {
      start_time: timeInputValue(slotDraft.start_time),
      end_time: timeInputValue(slotDraft.end_time),
    };
    if (next.start_time >= next.end_time) {
      setError("End time must be after start time");
      return;
    }
    if (selectedHours.slots.some((slot) => stadiumSlotsOverlap(slot, next))) {
      setError("That slot overlaps another time on this day");
      return;
    }
    const overlap = overlappingStadiumSlotsError([...selectedHours.slots, next]);
    if (overlap) {
      setError(overlap);
      return;
    }
    setError(null);
    patchSelectedDay({
      closed: false,
      slots: [...selectedHours.slots, next].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    });
  };

  const removeSlotFromSelectedDay = (index: number) => {
    const slots = selectedHours.slots.filter((_, slotIndex) => slotIndex !== index);
    patchSelectedDay({
      slots,
      closed: slots.length === 0 ? selectedHours.closed : false,
    });
  };

  const updateSlotOnSelectedDay = (index: number, patch: Partial<StadiumTimeSlot>) => {
    const slots = selectedHours.slots.map((slot, slotIndex) =>
      slotIndex === index ? { ...slot, ...patch } : slot,
    );
    patchSelectedDay({ slots });
  };

  const addBlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setSavingBlock(true);
    setError(null);
    try {
      const payload = {
        date: blockForm.date,
        end_date: blockForm.end_date || blockForm.date,
        start_time: blockForm.start_time,
        end_time: blockForm.end_time,
        notes: blockForm.notes,
        whole_day: blockForm.whole_day,
        recurrence: blockForm.recurrence,
        weekdays: blockForm.recurrence === "weekly" ? blockForm.weekdays : [],
      };
      const result = await postAdminResponse<{ ok?: boolean; created?: number }>(
        `/api/admin/stadiums/${id}/availability`,
        payload,
      );
      setBlockForm({
        date: "",
        end_date: "",
        start_time: "09:00",
        end_time: "11:00",
        notes: "Emergency",
        whole_day: false,
        recurrence: "",
        weekdays: [],
      });
      await load();
      const created = Number(result.created ?? 0);
      setNotice(
        created > 1
          ? `${created} days blocked. Fans cannot book those times.`
          : "Slot blocked. Fans will see it as unavailable.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Block failed");
    } finally {
      setSavingBlock(false);
    }
  };

  const toggleBlockWeekday = (day: number) => {
    setBlockForm((prev) => {
      const has = prev.weekdays.includes(day);
      return {
        ...prev,
        weekdays: has ? prev.weekdays.filter((d) => d !== day) : [...prev.weekdays, day].sort(),
      };
    });
  };

  const removeBlock = async (blockId: string) => {
    if (!canWrite) return;
    setError(null);
    try {
      await deleteAdmin(`/api/admin/stadiums/${id}/availability?blockId=${blockId}`);
      await load();
      setNotice("Block removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  const createManager = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canWrite) return;
    setSavingManager(true);
    setError(null);
    setCreatedLogin(null);
    try {
      const email = managerForm.email.trim().toLowerCase();
      const adminEmail = (staff?.email ?? "").trim().toLowerCase();
      if (adminEmail && email === adminEmail) {
        throw new Error(
          "Do not use your admin email for a stadium manager. That resets your admin password. Use a different email.",
        );
      }
      const payload = await postAdminResponse(`/api/admin/stadiums/${id}/managers`, {
        ...managerForm,
        full_name: managerForm.full_name.trim(),
        email,
        password: managerForm.password.trim(),
      });
      const password = payload.password || managerForm.password;
      setCreatedLogin({ email, password });
      setManagerForm({
        full_name: "",
        email: "",
        phone: "",
        password: generateStadiumManagerPassword(),
        manager_role: "manager",
      });
      try {
        await load();
      } catch (loadErr) {
        // Manager was created; don't treat a follow-up refresh failure as create failure.
        console.error(loadErr);
      }
      setNotice(`Manager login created. Email ${email} · Password ${password}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create manager failed");
    } finally {
      setSavingManager(false);
    }
  };

  const resetManagerPassword = async (row: StadiumManagerRow) => {
    if (!canWrite) return;
    const next = window.prompt("New password (leave empty to auto-generate)", row.login_password || "") ?? null;
    if (next === null) return;
    setError(null);
    try {
      const response = await fetch(`/api/admin/stadiums/${id}/managers/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ reset_password: true, password: next.trim() }),
      });
      const payload = (await response.json()) as { error?: string; password?: string };
      if (!response.ok) throw new Error(payload.error || "Reset failed");
      await load();
      setNotice(`Password updated: ${payload.password ?? next}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  };

  const toggleManager = async (row: StadiumManagerRow) => {
    if (!canWrite) return;
    try {
      await patchAdmin(`/api/admin/stadiums/${id}/managers/${row.id}`, { is_active: !row.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const revenue = useMemo(
    () => stadiumRevenueFromPayments(revenuePayments, pricing.currency),
    [pricing.currency, revenuePayments],
  );
  const monthLabel = useMemo(
    () => new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
    [],
  );
  const filteredSubscriptions = useMemo(() => {
    const q = normalizeAdminCode(passQuery);
    const nameQ = passQuery.trim().toLowerCase();
    if (!q && !nameQ) return subscriptions;
    return subscriptions.filter((row) => {
      const code = normalizeAdminCode(row.pass_code ?? "");
      const number = String(row.pass_number ?? "");
      const name = (row.users?.display_name ?? "").toLowerCase();
      return (q && (code.includes(q) || number.includes(q))) || (nameQ && name.includes(nameQ));
    });
  }, [passQuery, subscriptions]);

  const removeManager = async (row: StadiumManagerRow) => {
    if (!canWrite || !window.confirm(`Remove ${row.users?.display_name || "this manager"} from this stadium?`)) {
      return;
    }
    try {
      await deleteAdmin(`/api/admin/stadiums/${id}/managers/${row.id}`);
      await load();
      setNotice("Manager removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  if (loading) return <AdminLoadingRow label="Loading stadium…" />;
  if (!stadium) return <AdminErrorAlert message={error || "Stadium not found"} />;

  return (
    <>
      <AdminPageHeader
        title={stadium.name || "Stadium"}
        description={
          formatStadiumArea(stadium.subcity, stadium.wereda) ||
          stadium.location ||
          stadium.address ||
          stadium.slug ||
          ""
        }
        backHref="/admin/stadiums"
        stackOnSmall
        breadcrumbs={[
          { label: "Stadiums", href: "/admin/stadiums" },
          { label: stadium.name || "Detail" },
        ]}
        actions={
          canWrite ? (
            <div className="flex w-full flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                Edit
              </button>
              {stadium.status !== "active" ? (
                <button
                  type="button"
                  onClick={() => saveStadium({ status: "active" })}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Approve
                </button>
              ) : null}
              {stadium.status !== "inactive" ? (
                <button
                  type="button"
                  onClick={() => saveStadium({ status: "inactive" })}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
                >
                  Deactivate
                </button>
              ) : null}
              {stadium.status !== "rejected" ? (
                <button
                  type="button"
                  onClick={() => saveStadium({ status: "rejected" })}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  Reject
                </button>
              ) : null}
            </div>
          ) : null
        }
      />
      {error ? <AdminErrorAlert message={error} /> : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 pb-0 sm:-mx-6 sm:px-6 lg:-mx-8 lg:mx-0 lg:px-0">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex h-10 shrink-0 items-center whitespace-nowrap px-3 text-sm font-medium ${
              tab === item.id
                ? "border-b-2 border-primary text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {item.label}
            {item.id === "booking" ? ` (${bookings.length})` : null}
            {item.id === "managers" ? ` (${managers.length})` : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-6">
          {stadiumCoverUrl(stadium) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stadiumCoverUrl(stadium)}
              alt=""
              className="-mx-4 aspect-[16/9] w-[calc(100%+2rem)] object-cover sm:-mx-6 sm:w-[calc(100%+3rem)] sm:rounded-2xl lg:mx-0 lg:aspect-[21/9] lg:w-full"
            />
          ) : null}
          <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-sm font-semibold">Revenue</h2>
              <p className="text-xs text-text-hint">Completed payments</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
              {[
                { label: "Daily", hint: "Today", value: revenue.daily },
                { label: "Weekly", hint: "Last 7 days", value: revenue.weekly },
                { label: "Monthly", hint: monthLabel, value: revenue.monthly },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg bg-muted/30 p-4 sm:rounded-none sm:bg-transparent"
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-hint">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-text-primary">
                    {formatPrice(item.value, revenue.currency)}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">{item.hint}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold">Profile</h2>
                <StatusBadge tone={requestTone(stadium.status)}>{stadiumStatusLabel(stadium.status)}</StatusBadge>
              </div>
              <dl className="text-sm">
                <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <dt className="shrink-0 text-text-secondary">Size</dt>
                  <dd className="font-medium sm:text-right">
                    {sizeTypeLabel(stadium.size_type)}
                    {stadium.capacity > 0 ? ` · ${stadium.capacity} capacity` : ""}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <dt className="shrink-0 text-text-secondary">Sub-city</dt>
                  <dd className="font-medium sm:text-right">{stadium.subcity || "—"}</dd>
                </div>
                <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <dt className="shrink-0 text-text-secondary">Woreda</dt>
                  <dd className="font-medium sm:text-right">
                    {stadium.wereda != null ? `Woreda ${stadium.wereda}` : "—"}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <dt className="shrink-0 text-text-secondary">Location</dt>
                  <dd className="font-medium sm:text-right">{stadium.location || "—"}</dd>
                </div>
                <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <dt className="shrink-0 text-text-secondary">Address</dt>
                  <dd className="font-medium sm:text-right">{stadium.address || "—"}</dd>
                </div>
                <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <dt className="shrink-0 text-text-secondary">Owner</dt>
                  <dd className="sm:text-right">
                    {stadium.users ? (
                      <Link href={`/admin/users/${stadium.users.id}`} className="font-medium text-primary">
                        {stadium.users.display_name}
                      </Link>
                    ) : (
                      stadium.owner_name || "—"
                    )}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <dt className="shrink-0 text-text-secondary">Contact</dt>
                  <dd className="break-all font-medium sm:text-right">
                    {stadium.contact_phone || "—"}
                    {stadium.contact_email ? ` · ${stadium.contact_email}` : ""}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <dt className="shrink-0 text-text-secondary">Map</dt>
                  <dd className="font-medium sm:text-right">
                    {stadium.latitude != null && stadium.longitude != null ? (
                      <a
                        href={`https://www.google.com/maps?q=${stadium.latitude},${stadium.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary"
                      >
                        {stadium.address || stadium.location || "Open in Maps"}
                      </a>
                    ) : (
                      stadium.address || stadium.location || "—"
                    )}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <dt className="shrink-0 text-text-secondary">Created</dt>
                  <dd className="font-medium sm:text-right">{formatDate(stadium.created_at)}</dd>
                </div>
              </dl>
              {stadium.facilities.length > 0 ? (
                <p className="mt-4 text-sm text-text-secondary">Facilities: {stadium.facilities.join(", ")}</p>
              ) : null}
              <p className="mt-4 text-sm text-text-secondary">{stadium.description || "No description."}</p>
              {stadiumPhotoUrls(stadium.photos).filter((url) => url !== stadiumCoverUrl(stadium)).length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {stadiumPhotoUrls(stadium.photos)
                    .filter((url) => url !== stadiumCoverUrl(stadium))
                    .map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="" className="h-20 w-full rounded-md object-cover" />
                    ))}
                </div>
              ) : null}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-sm font-semibold">Contact</h2>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-primary hover:bg-muted"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-text-secondary">Phone</dt>
                  <dd className="font-medium">{stadium.contact_phone || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-text-secondary">Email</dt>
                  <dd className="text-right font-medium">{stadium.contact_email || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-text-secondary">Owner name</dt>
                  <dd className="text-right font-medium">{stadium.owner_name || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-text-secondary">Managers</dt>
                  <dd className="text-right font-medium">{managers.filter((row) => row.is_active).length}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "hours" ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="font-heading text-sm font-semibold">Weekly hours</h2>
            <p className="mt-1 mb-5 text-sm text-text-secondary">
              Set visiting hours for each day. Fans pay once for the day at any time — these slots only show when the
              pitch is open so they can decide whether to go.
            </p>
            <form onSubmit={saveHours} className="space-y-5">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {stadiumWeekDays.map((day) => {
                  const row = weekHours.find((item) => item.day_of_week === day.day);
                  const selected = selectedWeekDay === day.day;
                  return (
                    <button
                      key={day.day}
                      type="button"
                      onClick={() => setSelectedWeekDay(day.day)}
                      className={`min-w-[4.5rem] rounded-xl border px-3 py-2.5 text-center ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-text-primary hover:bg-muted"
                      }`}
                    >
                      <p className="text-sm font-semibold">{day.short}</p>
                      <p className={`mt-0.5 text-[11px] ${selected ? "text-primary-foreground/80" : "text-text-secondary"}`}>
                        {row?.closed || !row?.slots.length ? "Closed" : `${row.slots.length} slot${row.slots.length === 1 ? "" : "s"}`}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {stadiumWeekDays.find((day) => day.day === selectedWeekDay)?.label}
                    </p>
                    <p className="text-xs text-text-secondary">Add as many non-overlapping slots as you need.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={selectedHours.closed}
                      disabled={!canWrite}
                      onChange={(event) =>
                        patchSelectedDay({
                          closed: event.target.checked,
                          slots: event.target.checked ? [] : selectedHours.slots.length
                            ? selectedHours.slots
                            : [{ start_time: "06:00", end_time: "22:00" }],
                        })
                      }
                    />
                    Closed
                  </label>
                </div>

                {selectedHours.closed ? (
                  <p className="text-sm text-text-secondary">This day is closed. Fans will not be able to buy a day pass.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedHours.slots.length === 0 ? (
                      <p className="text-sm text-text-secondary">No slots yet. Add the times fans can visit.</p>
                    ) : (
                      selectedHours.slots.map((slot, index) => (
                        <div key={`${slot.start_time}-${slot.end_time}-${index}`} className="grid items-center gap-3 sm:grid-cols-[1fr_1fr_auto]">
                          <label className="grid gap-1 text-sm">
                            <span className="text-text-secondary">From</span>
                            <input
                              type="time"
                              value={timeInputValue(slot.start_time)}
                              disabled={!canWrite}
                              onChange={(event) =>
                                updateSlotOnSelectedDay(index, { start_time: event.target.value })
                              }
                              className="h-10 rounded-lg border border-border px-3 text-sm disabled:opacity-50"
                            />
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span className="text-text-secondary">To</span>
                            <input
                              type="time"
                              value={timeInputValue(slot.end_time)}
                              disabled={!canWrite}
                              onChange={(event) =>
                                updateSlotOnSelectedDay(index, { end_time: event.target.value })
                              }
                              className="h-10 rounded-lg border border-border px-3 text-sm disabled:opacity-50"
                            />
                          </label>
                          {canWrite ? (
                            <button
                              type="button"
                              onClick={() => removeSlotFromSelectedDay(index)}
                              className="h-10 self-end rounded-md border border-border px-3 text-sm text-red-600 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      ))
                    )}
                    {canWrite ? (
                      <div className="grid items-end gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto]">
                        <label className="grid gap-1 text-sm">
                          <span className="text-text-secondary">New from</span>
                          <input
                            type="time"
                            value={slotDraft.start_time}
                            onChange={(event) => setSlotDraft({ ...slotDraft, start_time: event.target.value })}
                            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-text-secondary">New to</span>
                          <input
                            type="time"
                            value={slotDraft.end_time}
                            onChange={(event) => setSlotDraft({ ...slotDraft, end_time: event.target.value })}
                            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={addSlotToSelectedDay}
                          className="h-10 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
                        >
                          Add slot
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {canWrite ? (
                <button
                  type="submit"
                  disabled={savingHours}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {savingHours ? "Saving…" : "Save hours"}
                </button>
              ) : null}
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="font-heading text-sm font-semibold">Block availability</h2>
            <p className="mt-1 mb-5 text-sm text-text-secondary">
              Block a day, specific hours, a date range, or a weekly recurrence. Fans cannot book blocked times or days.
            </p>
            {canWrite ? (
              <form onSubmit={addBlock} className="mb-5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">Start date</span>
                    <input
                      type="date"
                      required
                      value={blockForm.date}
                      onChange={(event) =>
                        setBlockForm({
                          ...blockForm,
                          date: event.target.value,
                          end_date: blockForm.end_date || event.target.value,
                        })
                      }
                      className="h-10 w-full rounded-lg border border-border px-3"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">End date</span>
                    <input
                      type="date"
                      value={blockForm.end_date}
                      min={blockForm.date || undefined}
                      onChange={(event) => setBlockForm({ ...blockForm, end_date: event.target.value })}
                      className="h-10 w-full rounded-lg border border-border px-3"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">From</span>
                    <input
                      type="time"
                      required={!blockForm.whole_day}
                      disabled={blockForm.whole_day}
                      value={blockForm.start_time}
                      onChange={(event) => setBlockForm({ ...blockForm, start_time: event.target.value })}
                      className="h-10 w-full rounded-lg border border-border px-3 disabled:opacity-50"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">To</span>
                    <input
                      type="time"
                      required={!blockForm.whole_day}
                      disabled={blockForm.whole_day}
                      value={blockForm.end_time}
                      onChange={(event) => setBlockForm({ ...blockForm, end_time: event.target.value })}
                      className="h-10 w-full rounded-lg border border-border px-3 disabled:opacity-50"
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex items-center gap-2 text-sm sm:pt-7">
                    <input
                      type="checkbox"
                      checked={blockForm.whole_day}
                      onChange={(event) =>
                        setBlockForm({ ...blockForm, whole_day: event.target.checked })
                      }
                      className="size-4 rounded border-border"
                    />
                    <span>Block entire day(s)</span>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">Recurrence</span>
                    <select
                      value={blockForm.recurrence}
                      onChange={(event) =>
                        setBlockForm({
                          ...blockForm,
                          recurrence: event.target.value === "weekly" ? "weekly" : "",
                        })
                      }
                      className="h-10 w-full rounded-lg border border-border px-3"
                    >
                      <option value="">One-time / date range</option>
                      <option value="weekly">Weekly (selected weekdays)</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-text-secondary">Reason</span>
                    <select
                      value={blockForm.notes}
                      onChange={(event) => setBlockForm({ ...blockForm, notes: event.target.value })}
                      className="h-10 w-full rounded-lg border border-border px-3"
                    >
                      <option value="Emergency">Emergency</option>
                      <option value="Internal event">Internal event</option>
                      <option value="Maintenance">Maintenance</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={savingBlock}
                      className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {savingBlock ? "Saving…" : "Block"}
                    </button>
                  </div>
                </div>
                {blockForm.recurrence === "weekly" ? (
                  <div>
                    <p className="mb-2 text-sm text-text-secondary">Repeat on</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { day: 0, label: "Sun" },
                        { day: 1, label: "Mon" },
                        { day: 2, label: "Tue" },
                        { day: 3, label: "Wed" },
                        { day: 4, label: "Thu" },
                        { day: 5, label: "Fri" },
                        { day: 6, label: "Sat" },
                      ].map((item) => {
                        const active = blockForm.weekdays.includes(item.day);
                        return (
                          <button
                            key={item.day}
                            type="button"
                            onClick={() => toggleBlockWeekday(item.day)}
                            className={`h-9 rounded-lg border px-3 text-sm font-medium ${
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card text-foreground"
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </form>
            ) : null}
            {blocks.length === 0 ? (
              <p className="text-sm text-text-secondary">No upcoming blocked slots.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {blocks.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                  >
                    <div>
                      <p className="font-medium">
                        {row.specific_date} · {row.start_time}–{row.end_time}
                      </p>
                      <p className="text-text-secondary">{row.notes || "Blocked"}</p>
                    </div>
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => removeBlock(row.id)}
                        className="text-sm font-medium text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "pricing" ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-1 font-heading text-sm font-semibold">Pricing</h2>
          <p className="mb-4 text-sm text-text-secondary">
            One price each for daily/session, monthly, and yearly. Leave a field empty if that option is not offered.
          </p>
          <form onSubmit={savePricing} className="grid gap-3 md:grid-cols-2">
            {stadiumPlanTypes.map((item) => (
              <label key={item.id} className="text-sm">
                <span className="mb-1 block text-text-secondary">{item.label} (ETB)</span>
                <input
                  type="number"
                  min={0}
                  value={pricing[item.id] ?? ""}
                  onChange={(event) =>
                    setPricing({
                      ...pricing,
                      [item.id]: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                  placeholder="Not offered"
                  className="h-10 w-full rounded-lg border border-border px-3"
                />
              </label>
            ))}
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Currency</span>
              <input
                value={pricing.currency}
                onChange={(event) => setPricing({ ...pricing, currency: event.target.value })}
                className="h-10 w-full rounded-lg border border-border px-3"
              />
            </label>
            {canWrite ? (
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={savingPlan}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {savingPlan ? "Saving…" : "Save pricing"}
                </button>
              </div>
            ) : null}
          </form>
        </section>
      ) : null}

      {tab === "booking" ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-4 font-heading text-sm font-semibold">Bookings</h2>
              {bookings.length === 0 ? (
                <p className="text-sm text-text-secondary">No bookings yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {bookings.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {row.booking_date} · {row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}
                        </p>
                        <p className="truncate text-text-secondary">
                          {row.users?.display_name ?? "User"} · {row.status}
                        </p>
                      </div>
                      <StatusBadge tone={requestTone(row.status)}>{row.status}</StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-sm font-semibold">Subscribers</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Monthly and yearly passes. The 6-character code is what managers scan at the gate.
                  </p>
                </div>
                <input
                  value={passQuery}
                  onChange={(event) => setPassQuery(event.target.value)}
                  placeholder="Search code or name"
                  className="h-10 w-56 rounded-lg border border-border px-3 text-sm tracking-widest"
                />
              </div>
              {filteredSubscriptions.length === 0 ? (
                <AdminEmpty
                  title="No subscribers"
                  description={passQuery ? "No passes match that search." : "Paid monthly and yearly passes will appear here."}
                />
              ) : (
                <AdminTableShell>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                        <tr>
                          <th className="px-4 py-3 font-semibold">#</th>
                          <th className="px-4 py-3 font-semibold">Code</th>
                          <th className="px-4 py-3 font-semibold">Subscriber</th>
                          <th className="px-4 py-3 font-semibold">Plan</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Started</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSubscriptions.map((row) => (
                          <tr key={row.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 tabular-nums">{row.pass_number || "—"}</td>
                            <td className="px-4 py-3">
                              <AdminCode value={row.pass_code} />
                            </td>
                            <td className="px-4 py-3">
                              {row.users ? (
                                <Link href={`/admin/users/${row.users.id}`} className="font-medium hover:text-primary">
                                  {row.users.display_name}
                                </Link>
                              ) : (
                                "User"
                              )}
                            </td>
                            <td className="px-4 py-3 text-text-secondary">{planTypeLabel(row.plan_type)}</td>
                            <td className="px-4 py-3">
                              <StatusBadge tone={requestTone(row.status)}>{row.status}</StatusBadge>
                            </td>
                            <td className="px-4 py-3 text-text-secondary">{formatDate(row.start_date || row.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AdminTableShell>
              )}
            </section>
          </div>
          <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-heading text-sm font-semibold">Payments</h2>
            {payments.length === 0 ? (
              <p className="text-sm text-text-secondary">No payments yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">User</th>
                      <th className="px-4 py-3 font-semibold">Amount</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">{row.users?.display_name ?? "—"}</td>
                        <td className="px-4 py-3 font-medium">{formatPrice(row.amount, row.currency)}</td>
                        <td className="px-4 py-3 text-text-secondary">{row.payment_type}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={requestTone(row.status)}>{row.status}</StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{formatDate(row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === "managers" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-sm font-semibold">Assigned managers</h2>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => {
                    setCreatedLogin(null);
                    setError(null);
                    setManagerOpen(true);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
                >
                  Create manager login
                </button>
              ) : null}
            </div>
            {managers.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No managers assigned yet.{canWrite ? " Use Create manager login to add one." : ""}
              </p>
            ) : (
              <AdminTableShell>
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] text-left text-sm">
                    <thead className="border-b border-border bg-muted/50 text-xs uppercase text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Email</th>
                        <th className="px-4 py-3 font-semibold">Password</th>
                        <th className="px-4 py-3 font-semibold">Role</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        {canWrite ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {managers.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            {row.users ? (
                              <Link href={`/admin/users/${row.users.id}`} className="font-medium text-primary">
                                {row.users.display_name}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{row.users?.email || "—"}</td>
                          <td className="px-4 py-3">
                            <VisiblePassword value={row.login_password} />
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{row.manager_role}</td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                              {row.is_active ? "Active" : "Inactive"}
                            </StatusBadge>
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => resetManagerPassword(row)} className="text-sm text-primary">
                                  Reset password
                                </button>
                                <button type="button" onClick={() => toggleManager(row)} className="text-sm text-text-secondary">
                                  {row.is_active ? "Deactivate" : "Activate"}
                                </button>
                                <button type="button" onClick={() => removeManager(row)} className="text-sm text-red-600">
                                  Remove
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AdminTableShell>
            )}
          </section>
        </div>
      ) : null}

      <AdminModal
        open={managerOpen}
        title={createdLogin ? "Manager login created" : "Create manager login"}
        onClose={() => {
          if (savingManager) return;
          setManagerOpen(false);
        }}
        sheet
        className="sm:max-w-2xl"
        footer={
          createdLogin ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setManagerOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setManagerOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-manager-form"
                disabled={savingManager}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {savingManager ? "Creating…" : "Create manager"}
              </button>
            </div>
          )
        }
      >
        {createdLogin ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Share these login details with the manager</p>
            <p className="mt-2">
              Email: <span className="font-mono">{createdLogin.email}</span>
            </p>
            <p className="mt-1">
              Password: <VisiblePassword value={createdLogin.password} />
            </p>
            <p className="mt-2 text-xs text-emerald-800">
              They sign in to the SpoJex app as a normal user (fan). The Manage tab appears only for this stadium.
            </p>
          </div>
        ) : (
          <form
            id="create-manager-form"
            onSubmit={(event) => {
              void createManager(event);
            }}
            className="grid gap-3 md:grid-cols-2"
          >
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
                {error}
              </p>
            ) : null}
            <p className="text-sm text-text-secondary md:col-span-2">
              Creates a SpoJex app login and assigns it to this stadium. Use a{" "}
              <span className="font-medium text-text-primary">different email than your admin account</span>
              . The password stays visible so you can share it. If that email already exists (and is not your admin
              login), that account is assigned and its app password is updated.
            </p>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Full name</span>
              <input
                value={managerForm.full_name}
                onChange={(event) => setManagerForm({ ...managerForm, full_name: event.target.value })}
                required
                className="h-10 w-full rounded-lg border border-border px-3"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Email</span>
              <input
                type="email"
                value={managerForm.email}
                onChange={(event) => setManagerForm({ ...managerForm, email: event.target.value })}
                required
                className="h-10 w-full rounded-lg border border-border px-3"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Phone</span>
              <input
                value={managerForm.phone}
                onChange={(event) => setManagerForm({ ...managerForm, phone: event.target.value })}
                className="h-10 w-full rounded-lg border border-border px-3"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Password (visible)</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={managerForm.password}
                  onChange={(event) => setManagerForm({ ...managerForm, password: event.target.value })}
                  required
                  minLength={6}
                  autoComplete="off"
                  className="h-10 w-full rounded-lg border border-border px-3 font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    setManagerForm({ ...managerForm, password: generateStadiumManagerPassword() })
                  }
                  className="shrink-0 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                >
                  Generate
                </button>
              </div>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-text-secondary">Role</span>
              <select
                value={managerForm.manager_role}
                onChange={(event) => setManagerForm({ ...managerForm, manager_role: event.target.value })}
                className="h-10 w-full rounded-lg border border-border px-3"
              >
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </label>
          </form>
        )}
      </AdminModal>

      <StadiumEditModal
        stadium={stadium}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={async () => {
          await load();
          setNotice("Saved.");
        }}
      />
    </>
  );
}
