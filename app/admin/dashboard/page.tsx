"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Building2,
  ClipboardList,
  Flag,
  Images,
  MessageCircle,
  ShoppingBag,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import { AdminErrorAlert, AdminLoadingRow, AdminStatCard } from "@/components/admin-layout";
import { getSupabase } from "@/lib/supabase/client";
import { safeCount } from "@/lib/supabase-tables";
import { roleLabel } from "@/lib/catalog";
import { formatDate } from "@/lib/utils";
import type { UserRow } from "@/lib/types";

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
  profileMedia: number;
  radioChat: number;
  radioReports: number;
  wallets: number;
  pendingWithdrawals: number;
  awaitingPayment: number;
};

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
  profileMedia: 0,
  radioChat: 0,
  radioReports: 0,
  wallets: 0,
  pendingWithdrawals: 0,
  awaitingPayment: 0,
};

async function count(table: string, filters?: Record<string, string | boolean>) {
  return safeCount(table, filters);
}

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [recentUsers, setRecentUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          profileMedia,
          radioChat,
          radioReports,
          wallets,
          pendingWithdrawals,
          awaitingPayment,
          recent,
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
          count("profile_media"),
          count("radio_chat_messages"),
          count("radio_chat_reports"),
          count("wallets"),
          count("withdrawal_requests", { status: "pending" }),
          count("service_requests", { status: "awaiting_payment" }),
          getSupabase()
            .from("users")
            .select("id, display_name, role, city, country, verified, created_at")
            .order("created_at", { ascending: false })
            .limit(8),
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
          profileMedia,
          radioChat,
          radioReports,
          wallets,
          pendingWithdrawals,
          awaitingPayment,
        });
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
  }, []);

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="SpoJex identities, organizations, and marketplace activity"
      />
      {loading ? <AdminLoadingRow label="Loading overview…" /> : null}
      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard title="Users" value={String(counts.users)} />
        <AdminStatCard title="Verified users" value={String(counts.verifiedUsers)} />
        <AdminStatCard title="Organizations" value={String(counts.organizations)} />
        <AdminStatCard title="Verified orgs" value={String(counts.verifiedOrgs)} />
        <AdminStatCard title="Services" value={String(counts.services)} />
        <AdminStatCard title="Published services" value={String(counts.publishedServices)} />
        <AdminStatCard title="Pending services" value={String(counts.pendingServices)} />
        <AdminStatCard title="Pending bookings" value={String(counts.pendingRequests)} />
        <AdminStatCard title="Awaiting payment" value={String(counts.awaitingPayment)} />
        <AdminStatCard title="Provider wallets" value={String(counts.wallets)} />
        <AdminStatCard title="Pending withdrawals" value={String(counts.pendingWithdrawals)} />
        <AdminStatCard title="Reviews" value={String(counts.reviews)} />
        <AdminStatCard title="Photos & clips" value={String(counts.profileMedia)} />
        <AdminStatCard title="Radio chat" value={String(counts.radioChat)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Recent users</h2>
            <Link href="/admin/users" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentUsers.length === 0 && !loading ? (
              <p className="py-8 text-center text-sm text-text-secondary">No users yet.</p>
            ) : null}
            {recentUsers.map((user) => (
              <Link
                key={user.id}
                href={`/admin/users/${user.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.display_name || "Unnamed"}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {roleLabel(user.role)} · {[user.city, user.country].filter(Boolean).join(", ") || "—"}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-text-hint">{formatDate(user.created_at)}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {[
            { href: "/admin/users", label: "Users", icon: Users, value: counts.users },
            { href: "/admin/organizations", label: "Organizations", icon: Building2, value: counts.organizations },
            { href: "/admin/services", label: "Services", icon: ShoppingBag, value: counts.services },
            { href: "/admin/requests", label: "Bookings", icon: ClipboardList, value: counts.requests },
            { href: "/admin/wallets", label: "Wallets", icon: Wallet, value: counts.wallets },
            { href: "/admin/withdrawals", label: "Withdrawals", icon: Banknote, value: counts.pendingWithdrawals },
            { href: "/admin/reviews", label: "Reviews", icon: Star, value: counts.reviews },
            { href: "/admin/profile-media", label: "Photos & clips", icon: Images, value: counts.profileMedia },
            { href: "/admin/radio-chat", label: "Radio chat", icon: MessageCircle, value: counts.radioChat },
            { href: "/admin/reports", label: "Reports", icon: Flag, value: counts.reports + counts.radioReports },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-sm hover:border-primary/30"
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <item.icon className="h-4 w-4 text-primary" />
                {item.label}
              </span>
              <span className="tabular-nums text-sm text-text-secondary">{item.value}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
