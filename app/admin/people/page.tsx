"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Settings2, X } from "lucide-react";
import AdminPageHeader from "@/components/admin-header";
import {
  AdminEmpty,
  AdminErrorAlert,
  AdminFilterPanel,
  AdminLoadingRow,
  AdminReloadButton,
  AdminSearchInput,
  AdminSelect,
} from "@/components/admin-layout";
import { StatusBadge, requestTone, verifiedTone } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { adminCacheKey } from "@/lib/admin-session-cache";
import { useIdentityCatalog } from "@/lib/hooks";
import { useAdminQuery } from "@/lib/use-admin-query";
import { useAdminPermissions } from "@/lib/use-admin-permissions";
import { cn, formatDate, formatStatusLabel } from "@/lib/utils";
import { verificationStatusLabel } from "@/lib/verification";

type PersonRow = {
  id: string;
  display_name: string;
  full_name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  verified: boolean;
  city: string;
  country: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  profile_types: string[];
  organizations: { id: string; name: string }[];
  verification_request_status: string | null;
  account_status: string;
  last_activity_at: string | null;
};

type Summary = {
  total_people: number;
  new_registrations_30d: number;
  pending_verifications: number;
  restricted_accounts: number;
};

type PreviewPayload = {
  user: PersonRow & { headline?: string; bio?: string };
  profile_types: string[];
  profiles: Record<string, unknown>;
  owned_organizations: { id: string; name: string; organization_type?: string; verified?: boolean }[];
  memberships: unknown[];
  verifications: { id: string; status: string; created_at: string }[];
  account_status: string;
};

const PAGE_SIZE = 30;

function profileBadgeLabel(t: string) {
  if (t === "athlete") return "Athlete";
  if (t === "professional") return "Professional";
  if (t === "media") return "Media";
  return formatStatusLabel(t);
}

export default function PeopleDirectoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAdminPermissions();
  const { roleLabel } = useIdentityCatalog();

  const [selected, setSelected] = useState<string[]>([]);

  const q = searchParams.get("q") || "";
  const profile = searchParams.get("profile") || "all";
  const verified = searchParams.get("verified") || "all";
  const status = searchParams.get("status") || "active";
  const page = Math.max(Number(searchParams.get("page") || 1) || 1, 1);
  const previewId = searchParams.get("preview");

  const writeParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  type PeopleListData = { rows: PersonRow[]; total: number; summary: Summary | null };

  const listKey = adminCacheKey(["people", "list", page, profile, verified, status, q]);
  const {
    data: listData,
    loading,
    refreshing,
    error,
    refresh,
  } = useAdminQuery<PeopleListData>({
    key: listKey,
    fetcher: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
        profile,
        verified,
        status,
      });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/people?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as {
        summary?: Summary;
        data?: PersonRow[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to load people");
      return {
        rows: payload.data ?? [],
        total: payload.total ?? 0,
        summary: payload.summary ?? null,
      };
    },
  });

  const rows = listData?.rows ?? [];
  const total = listData?.total ?? 0;
  const summary = listData?.summary ?? null;

  const previewKey = previewId ? adminCacheKey(["people", "preview", previewId]) : null;
  const {
    data: preview,
    loading: previewLoading,
  } = useAdminQuery<PreviewPayload>({
    key: previewKey,
    enabled: Boolean(previewId),
    fetcher: async () => {
      const res = await fetch(`/api/admin/people/${previewId}/preview`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Preview failed");
      return payload.data as PreviewPayload;
    },
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openPreview = (id: string) => {
    writeParams({ preview: id });
  };

  const closePreview = () => {
    writeParams({ preview: null });
  };

  const toggleSelect = (id: string) => {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.includes(r.id)),
    [rows, selected],
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="People"
        description="Directory of Spojex accounts and role profiles"
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminReloadButton
              loading={loading}
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
            {can("profiles:read") ? (
              <Link
                href="/admin/people/settings"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-text-secondary hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Profile settings
              </Link>
            ) : null}
          </div>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total people" value={summary?.total_people} loading={loading && !summary} />
        <SummaryCard
          label="New (30 days)"
          value={summary?.new_registrations_30d}
          loading={loading && !summary}
        />
        <SummaryCard
          label="Pending verifications"
          value={summary?.pending_verifications}
          loading={loading && !summary}
          onClick={() => writeParams({ verified: "no", status: "active", page: "1" })}
        />
        <SummaryCard
          label="Restricted accounts"
          value={summary?.restricted_accounts}
          loading={loading && !summary}
          onClick={() => writeParams({ status: "restricted", page: "1" })}
        />
      </div>

      <AdminFilterPanel>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[
            { label: "All people", patch: { profile: null, verified: null, status: "active" } },
            { label: "Athletes", patch: { profile: "athlete", status: "active" } },
            { label: "Unverified", patch: { verified: "no", status: "active" } },
            { label: "Restricted", patch: { status: "restricted" } },
          ].map((view) => {
            const active =
              (view.patch.profile ?? "all") === profile &&
              (view.patch.verified ?? "all") === verified &&
              (view.patch.status ?? "active") === status &&
              !q;
            return (
              <button
                key={view.label}
                type="button"
                onClick={() =>
                  writeParams({
                    profile: view.patch.profile ?? null,
                    verified: view.patch.verified ?? null,
                    status: view.patch.status ?? "active",
                    q: null,
                    page: "1",
                  })
                }
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-text-secondary hover:text-foreground",
                )}
              >
                {view.label}
              </button>
            );
          })}
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_140px_140px_140px]">
          <AdminSearchInput
            value={q}
            onChange={(value) => writeParams({ q: value || null, page: "1" })}
            placeholder="Search name, email, username, phone…"
          />
          <AdminSelect
            value={profile}
            onChange={(value) => writeParams({ profile: value === "all" ? null : value, page: "1" })}
          >
            <option value="all">All profiles</option>
            <option value="athlete">Athletes</option>
            <option value="professional">Professionals</option>
            <option value="media">Media</option>
            <option value="fan">Fans / community</option>
          </AdminSelect>
          <AdminSelect
            value={verified}
            onChange={(value) => writeParams({ verified: value === "all" ? null : value, page: "1" })}
          >
            <option value="all">All verification</option>
            <option value="yes">Verified</option>
            <option value="no">Unverified</option>
          </AdminSelect>
          <AdminSelect
            value={status}
            onChange={(value) => writeParams({ status: value, page: "1" })}
          >
            <option value="active">Active</option>
            <option value="restricted">Restricted</option>
            <option value="all">All statuses</option>
          </AdminSelect>
        </div>
      </AdminFilterPanel>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-text-secondary">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={loading || rows.length === 0}
                onChange={() =>
                  setSelected(allSelected ? [] : rows.map((r) => r.id))
                }
              />
              {selected.length ? `${selected.length} selected` : `${total} people`}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => writeParams({ page: String(page - 1) })}
                className="rounded border border-border p-1 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => writeParams({ page: String(page + 1) })}
                className="rounded border border-border p-1 disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {loading ? (
            <AdminLoadingRow label="Loading people…" compact className="py-10" />
          ) : rows.length === 0 ? (
            <AdminEmpty title="No people found" description="Try adjusting filters or search, then Reload." />
          ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id}>
                <div
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
                    previewId === row.id && "bg-secondary/60",
                  )}
                  onClick={() => openPreview(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPreview(row.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(row.id)}
                    className="shrink-0"
                    aria-label={`Select ${row.display_name}`}
                  />
                  <UserAvatar name={row.display_name || row.full_name} src={row.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {row.display_name || row.full_name || "Unnamed"}
                      </p>
                      {(row.profile_types || []).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                        >
                          {profileBadgeLabel(t)}
                        </span>
                      ))}
                    </div>
                    <p className="truncate text-xs text-text-secondary">
                      {[row.email || row.username || row.phone, roleLabel(row.role)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    <StatusBadge tone={verifiedTone(row.verified)}>
                      {row.verified ? "Verified" : "Unverified"}
                    </StatusBadge>
                    {row.verification_request_status ? (
                      <span className="text-[10px] text-text-hint">
                        Req: {verificationStatusLabel(row.verification_request_status)}
                      </span>
                    ) : null}
                  </div>
                  <div className="hidden w-36 shrink-0 truncate text-right text-xs text-text-secondary lg:block">
                    {row.organizations?.[0]?.name || "-"}
                  </div>
                  <div className="hidden w-24 shrink-0 text-right text-[11px] text-text-hint xl:block">
                    {row.last_activity_at ? formatDate(row.last_activity_at) : "-"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          )}
      </div>

      {previewId ? (
        <PersonDrawer
          loading={previewLoading}
          preview={preview}
          roleLabel={roleLabel}
          onClose={closePreview}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  loading,
  href,
  onClick,
}: {
  label: string;
  value?: number;
  loading?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-hint">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
          {value == null ? "-" : new Intl.NumberFormat("en-US").format(value)}
        </p>
      )}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  if (onClick) {
    return (
      <button type="button" className="text-left" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return inner;
}

function PersonDrawer({
  loading,
  preview,
  roleLabel,
  onClose,
}: {
  loading: boolean;
  preview: PreviewPayload | null;
  roleLabel: (slug?: string | null) => string;
  onClose: () => void;
}) {
  const user = preview?.user;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Person preview"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-heading text-sm font-semibold">Quick preview</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-text-secondary" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading || !user ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-16 w-16 rounded-full bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <UserAvatar name={user.display_name || user.full_name} src={user.avatar_url} size={56} />
                <div className="min-w-0">
                  <p className="font-heading text-base font-semibold">
                    {user.display_name || user.full_name}
                  </p>
                  <p className="text-xs text-text-secondary">{user.email || user.username || "-"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge tone={verifiedTone(user.verified)}>
                      {user.verified ? "Verified" : "Unverified"}
                    </StatusBadge>
                    <StatusBadge tone={preview?.account_status === "restricted" ? "neutral" : "success"}>
                      {preview?.account_status === "restricted" ? "Restricted" : "Active"}
                    </StatusBadge>
                  </div>
                </div>
              </div>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
                  Profile types
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {(preview?.profile_types?.length ? preview.profile_types : ["none"]).map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                    >
                      {t === "none" ? roleLabel(user.role) : profileBadgeLabel(t)}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
                  Organizations
                </h4>
                {(preview?.owned_organizations?.length ?? 0) === 0 &&
                (preview?.memberships?.length ?? 0) === 0 ? (
                  <p className="text-xs text-text-hint">No linked organizations</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {preview!.owned_organizations.map((o) => (
                      <li key={o.id}>
                        <Link href={`/admin/organizations/${o.id}`} className="text-primary hover:underline">
                          {o.name}
                        </Link>
                        <span className="ml-1 text-[10px] text-text-hint">owner</span>
                      </li>
                    ))}
                    {(preview!.memberships as { organizations?: { id: string; name: string } | null }[]).map(
                      (m, i) =>
                        m.organizations ? (
                          <li key={`${m.organizations.id}-${i}`}>
                            <Link
                              href={`/admin/organizations/${m.organizations.id}`}
                              className="text-primary hover:underline"
                            >
                              {m.organizations.name}
                            </Link>
                            <span className="ml-1 text-[10px] text-text-hint">member</span>
                          </li>
                        ) : null,
                    )}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-hint">
                  Verification
                </h4>
                {(preview?.verifications?.length ?? 0) === 0 ? (
                  user.verified ? (
                    <p className="text-xs text-text-hint">No verification requests</p>
                  ) : (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <StatusBadge tone="warning">Pending verification</StatusBadge>
                      <Link
                        href="/admin/verifications?status=all"
                        className="text-primary hover:underline"
                      >
                        Verification center
                      </Link>
                    </div>
                  )
                ) : (
                  <ul className="space-y-2">
                    {preview!.verifications.map((v) => (
                      <li key={v.id} className="flex items-center justify-between text-xs">
                        <StatusBadge tone={requestTone(v.status)}>
                          {verificationStatusLabel(v.status)}
                        </StatusBadge>
                        <Link
                          href={`/admin/verifications?id=${v.id}`}
                          className="text-primary hover:underline"
                        >
                          Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-text-hint">Role</dt>
                  <dd className="font-medium">{roleLabel(user.role)}</dd>
                </div>
                <div>
                  <dt className="text-text-hint">Joined</dt>
                  <dd className="font-medium">{formatDate(user.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-text-hint">Last updated</dt>
                  <dd className="font-medium">
                    {user.updated_at ? formatDate(user.updated_at) : "Not tracked"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-hint">Location</dt>
                  <dd className="font-medium">
                    {[user.city, user.country].filter(Boolean).join(", ") || "-"}
                  </dd>
                </div>
              </dl>

              <Link
                href={`/admin/people/${user.id}`}
                className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
              >
                Open full profile
              </Link>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
