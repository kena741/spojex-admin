"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Banknote,
  Building2,
  ClipboardList,
  Flag,
  ShoppingBag,
  Star,
  Users,
  Wallet,
  Clock,
  ArrowRight,
  BadgeCheck,
  TrendingUp,
  Calendar,
  Landmark,
  Ticket,
  Heart,
  Coins,
} from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert } from "@/components/admin-layout";
import { getSpojexClient } from "@/lib/spojex/client";
import { safeCount } from "@/lib/table-helpers";
import { roleLabel } from "@/lib/catalog";
import { formatDate } from "@/lib/utils";
import type { UserRow } from "@/lib/types";

/* ─── Types ─── */

type Counts = {
  users: number;
  verifiedUsers: number;
  organizations: number;
  verifiedOrgs: number;
  services: number;
  publishedServices: number;
  pendingServices: number;
  requests: number;
  pendingRequests: number;
  reviews: number;
  reports: number;
  wallets: number;
  pendingWithdrawals: number;
  awaitingPayment: number;
};

type RevenueBreakdown = {
  total: number;
  serviceCommission: number;
  stadiumPayments: number;
  eventPayments: number;
  miniAppPayments: number;
  donations: number;
};

type RangeKey = "today" | "7d" | "30d" | "all";

const PLATFORM_COMMISSION_RATE = 0.1; // 10% platform commission

const emptyCounts: Counts = {
  users: 0,
  verifiedUsers: 0,
  organizations: 0,
  verifiedOrgs: 0,
  services: 0,
  publishedServices: 0,
  pendingServices: 0,
  requests: 0,
  pendingRequests: 0,
  reviews: 0,
  reports: 0,
  wallets: 0,
  pendingWithdrawals: 0,
  awaitingPayment: 0,
};

const emptyRevenue: RevenueBreakdown = {
  total: 0,
  serviceCommission: 0,
  stadiumPayments: 0,
  eventPayments: 0,
  miniAppPayments: 0,
  donations: 0,
};

async function count(table: string, filters?: Record<string, string | boolean>) {
  return safeCount(table, filters);
}

/* ─── Date Range Helpers ─── */

function getRangeStart(range: RangeKey): Date | null {
  const now = new Date();
  switch (range) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "all":
      return null;
  }
}

function formatETB(amount: number): string {
  return `ETB ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ─── Revenue Fetcher ─── */

async function fetchRevenue(range: RangeKey): Promise<RevenueBreakdown> {
  const start = getRangeStart(range);
  const dateFilter = start ? { gte: start.toISOString() } : {};

  const [servicePayments, stadiumPayments, eventPayments, miniAppPayments, donations] =
    await Promise.all([
      getSpojexClient()
        .from("service_payments")
        .select("amount, status, paid_at, created_at")
        .eq("status", "completed")
        .gte("paid_at", start?.toISOString() ?? "1970-01-01"),
      getSpojexClient()
        .from("stadium_payments")
        .select("amount, status, paid_at, created_at")
        .eq("status", "completed")
        .gte("paid_at", start?.toISOString() ?? "1970-01-01"),
      getSpojexClient()
        .from("event_payments")
        .select("amount, status, paid_at, created_at")
        .eq("status", "completed")
        .gte("paid_at", start?.toISOString() ?? "1970-01-01"),
      getSpojexClient()
        .from("mini_app_payments")
        .select("amount, status, paid_at, created_at")
        .eq("status", "completed")
        .gte("paid_at", start?.toISOString() ?? "1970-01-01"),
      getSpojexClient()
        .from("donation_contributions")
        .select("amount, status, paid_at, created_at")
        .eq("status", "completed")
        .gte("paid_at", start?.toISOString() ?? "1970-01-01"),
    ]);

  const sumAmounts = (rows: { amount: number | string }[]) =>
    rows.reduce((acc, r) => acc + (typeof r.amount === "string" ? parseFloat(r.amount) : r.amount), 0);

  const serviceGross = sumAmounts((servicePayments.data ?? []) as { amount: number | string }[]);
  const serviceCommission = Math.round(serviceGross * PLATFORM_COMMISSION_RATE * 100) / 100;
  const stadiumTotal = sumAmounts((stadiumPayments.data ?? []) as { amount: number | string }[]);
  const eventTotal = sumAmounts((eventPayments.data ?? []) as { amount: number | string }[]);
  const miniAppTotal = sumAmounts((miniAppPayments.data ?? []) as { amount: number | string }[]);
  const donationTotal = sumAmounts((donations.data ?? []) as { amount: number | string }[]);

  const total = serviceCommission + stadiumTotal + eventTotal + miniAppTotal + donationTotal;

  return {
    total: Math.round(total * 100) / 100,
    serviceCommission,
    stadiumPayments: stadiumTotal,
    eventPayments: eventTotal,
    miniAppPayments: miniAppTotal,
    donations: donationTotal,
  };
}

/* ─── Range Selector ─── */

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "all", label: "All" },
];

function RangeSelector({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.key
              ? "bg-primary text-primary-foreground"
              : "text-text-secondary hover:bg-muted hover:text-text-primary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Revenue Card ─── */

function RevenueCard({
  title,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  subtitle,
}: {
  title: string;
  value: number;
  icon: typeof Users;
  iconColor: string;
  iconBg: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:shadow-md sm:p-5">
      <div className="mb-2 flex items-start justify-between sm:mb-3">
        <p className="text-xs font-medium text-text-secondary sm:text-sm">{title}</p>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${iconColor}`} />
        </span>
      </div>
      <p className="font-heading text-lg font-bold tabular-nums text-text-primary sm:text-2xl">
        {formatETB(value)}
      </p>
      {subtitle ? <p className="mt-0.5 text-[10px] text-text-hint sm:mt-1 sm:text-xs">{subtitle}</p> : null}
    </div>
  );
}

/* ─── Stat Card ─── */

type StatCardProps = {
  title: string;
  value: string | number;
  icon: typeof Users;
  iconColor?: string;
  iconBg?: string;
  href?: string;
  subtitle?: string;
};

function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  href,
  subtitle,
}: StatCardProps) {
  const content = (
    <div className="group flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md sm:p-5">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-sm font-medium text-text-secondary">{title}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </span>
      </div>
      <p className="font-heading text-2xl font-bold tabular-nums text-text-primary sm:text-3xl">
        {value}
      </p>
      {subtitle ? <p className="mt-1 text-xs text-text-hint">{subtitle}</p> : null}
      {href ? (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          View details <ArrowRight className="h-3 w-3" />
        </div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

/* ─── Recent User Row ─── */

function RecentUserRow({ user }: { user: UserRow }) {
  const initials =
    user.display_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <Link
      href={`/admin/users/${user.id}`}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">
          {user.display_name || "Unnamed"}
        </p>
        <p className="truncate text-xs text-text-secondary">
          {roleLabel(user.role)} · {[user.city, user.country].filter(Boolean).join(", ") || "—"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {user.verified ? (
          <BadgeCheck className="h-4 w-4 text-emerald-500" />
        ) : null}
        <span className="text-xs text-text-hint">{formatDate(user.created_at)}</span>
      </div>
    </Link>
  );
}

/* ─── Loading Skeleton ─── */

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-border bg-card p-5"
          >
            <div className="mb-3 h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-border bg-card p-5"
          >
            <div className="mb-3 h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

/* ─── Main Dashboard ─── */

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rangeParam = searchParams.get("range") as RangeKey | null;
  const range: RangeKey = rangeParam && ["today", "7d", "30d", "all"].includes(rangeParam)
    ? rangeParam
    : "all";

  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [revenue, setRevenue] = useState<RevenueBreakdown>(emptyRevenue);
  const [recentUsers, setRecentUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setRange = useCallback(
    (newRange: RangeKey) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("range", newRange);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [
          users,
          verifiedUsers,
          organizations,
          verifiedOrgs,
          services,
          publishedServices,
          pendingServices,
          requests,
          pendingRequests,
          reviews,
          reports,
          wallets,
          pendingWithdrawals,
          awaitingPayment,
          recent,
          revenueData,
        ] = await Promise.all([
          count("users"),
          count("users", { verified: true }),
          count("organizations"),
          count("organizations", { verified: true }),
          count("services"),
          count("services", { published: true }),
          count("services", { published: false }),
          count("service_requests"),
          count("service_requests", { status: "pending" }),
          count("service_reviews"),
          count("reports"),
          count("wallets"),
          count("withdrawal_requests", { status: "pending" }),
          count("service_requests", { status: "awaiting_payment" }),
          getSpojexClient()
            .from("users")
            .select("id, display_name, role, city, country, verified, created_at")
            .order("created_at", { ascending: false })
            .limit(8),
          fetchRevenue(range),
        ]);
        if (!mounted) return;
        if (recent.error) throw recent.error;
        setCounts({
          users,
          verifiedUsers,
          organizations,
          verifiedOrgs,
          services,
          publishedServices,
          pendingServices,
          requests,
          pendingRequests,
          reviews,
          reports,
          wallets,
          pendingWithdrawals,
          awaitingPayment,
        });
        setRevenue(revenueData);
        setRecentUsers((recent.data ?? []) as UserRow[]);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [range]);

  const verifiedUserPercent =
    counts.users > 0 ? Math.round((counts.verifiedUsers / counts.users) * 100) : 0;
  const verifiedOrgPercent =
    counts.organizations > 0
      ? Math.round((counts.verifiedOrgs / counts.organizations) * 100)
      : 0;
  const publishedServicePercent =
    counts.services > 0 ? Math.round((counts.publishedServices / counts.services) * 100) : 0;

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="Platform overview"
        actions={<RangeSelector value={range} onChange={setRange} />}
      />

      {loading ? <DashboardSkeleton /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          {/* ── Revenue Stats ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-sm font-semibold text-text-primary">Revenue</h2>
              <span className="text-xs text-text-hint">
                {range === "today"
                  ? "Today"
                  : range === "7d"
                    ? "Last 7 days"
                    : range === "30d"
                      ? "Last 30 days"
                      : "All time"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
              <RevenueCard
                title="Total revenue"
                value={revenue.total}
                icon={Banknote}
                iconColor="text-emerald-600"
                iconBg="bg-emerald-50"
              />
              <RevenueCard
                title="Service commission"
                value={revenue.serviceCommission}
                icon={ShoppingBag}
                iconColor="text-blue-600"
                iconBg="bg-blue-50"
                subtitle={`${(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% of service payments`}
              />
              <RevenueCard
                title="Stadium payments"
                value={revenue.stadiumPayments}
                icon={Landmark}
                iconColor="text-violet-600"
                iconBg="bg-violet-50"
              />
              <RevenueCard
                title="Event payments"
                value={revenue.eventPayments}
                icon={Ticket}
                iconColor="text-sky-600"
                iconBg="bg-sky-50"
              />
              <RevenueCard
                title="Mini-app + donations"
                value={revenue.miniAppPayments + revenue.donations}
                icon={Heart}
                iconColor="text-pink-600"
                iconBg="bg-pink-50"
              />
            </div>
          </section>

          {/* ── Core Stats ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-sm font-semibold text-text-primary">
                Platform stats
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Total users"
                value={counts.users.toLocaleString()}
                icon={Users}
                iconColor="text-blue-600"
                iconBg="bg-blue-50"
                href="/admin/users"
                subtitle={`${verifiedUserPercent}% verified`}
              />
              <StatCard
                title="Organizations"
                value={counts.organizations.toLocaleString()}
                icon={Building2}
                iconColor="text-violet-600"
                iconBg="bg-violet-50"
                href="/admin/organizations"
                subtitle={`${verifiedOrgPercent}% verified`}
              />
              <StatCard
                title="Services"
                value={counts.services.toLocaleString()}
                icon={ShoppingBag}
                iconColor="text-indigo-600"
                iconBg="bg-indigo-50"
                href="/admin/services"
                subtitle={`${publishedServicePercent}% published`}
              />
              <StatCard
                title="Bookings"
                value={counts.requests.toLocaleString()}
                icon={ClipboardList}
                iconColor="text-sky-600"
                iconBg="bg-sky-50"
                href="/admin/requests"
                subtitle={`${counts.pendingRequests} pending`}
              />
              <StatCard
                title="Provider wallets"
                value={counts.wallets.toLocaleString()}
                icon={Wallet}
                iconColor="text-emerald-600"
                iconBg="bg-emerald-50"
                href="/admin/wallets"
              />
              <StatCard
                title="Pending withdrawals"
                value={counts.pendingWithdrawals.toLocaleString()}
                icon={Banknote}
                iconColor="text-amber-600"
                iconBg="bg-amber-50"
                href="/admin/withdrawals"
              />
              <StatCard
                title="Reviews"
                value={counts.reviews.toLocaleString()}
                icon={Star}
                iconColor="text-yellow-600"
                iconBg="bg-yellow-50"
                href="/admin/reviews"
              />
              <StatCard
                title="Reports"
                value={counts.reports.toLocaleString()}
                icon={Flag}
                iconColor="text-red-600"
                iconBg="bg-red-50"
                href="/admin/reports"
              />
            </div>
          </section>

          {/* ── Recent Users ── */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="font-heading text-sm font-semibold text-text-primary">
                  Recent users
                </h2>
              </div>
              <Link
                href="/admin/users"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="p-2">
              {recentUsers.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-secondary">No users yet.</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {recentUsers.map((user) => (
                    <RecentUserRow key={user.id} user={user} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
